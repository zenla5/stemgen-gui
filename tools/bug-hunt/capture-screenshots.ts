/**
 * capture-screenshots.ts
 *
 * Bug-hunt & Visual QA harness — screenshot capture + layout/overflow checks.
 *
 * Drives the REAL StemgenGUI app (Vite dev server) in a real browser, injecting
 * a Tauri IPC mock (window.__TAURI_INTERNALS__) so the app runs without the Rust
 * shell, and seeding deterministic state (files, stems, jobs, history, theme)
 * via the app's own Zustand stores through Vite's module graph.
 *
 * It never edits app source. It only observes and drives the UI.
 *
 * Usage:
 *   npx tsx tools/bug-hunt/capture-screenshots.ts [--state home_empty] [--no-layout]
 *
 * Outputs (relative to this file):
 *   screenshots/<state>_<light|dark>.png       (1280x800)
 *   screenshots/<state>_<light|dark>_mobile.png (390x844)
 *   screenshots/console-errors.log
 *   screenshots/layout-violations.txt          (non-empty => FAIL)
 *
 * Exit status: 0 if all desired states captured and no layout violations fired.
 */

import { chromium, type Browser, type Page, type BrowserContext } from '@playwright/test';
import { mkdirSync, writeFileSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = join(__dirname, 'screenshots');
const ROOT_DIR = resolve(__dirname, '..');
mkdirSync(SHOT_DIR, { recursive: true });

const BASE_URL = process.env.BUG_HUNT_BASE_URL ?? 'http://localhost:1420';
const CHROMIUM_PATH = '/run/current-system/sw/bin/chromium';
const FIXTURE_WAV = '/tests/fixtures/audio/test-short.wav';

// ---------------------------------------------------------------------------
// Vite dev server lifecycle: reuse an already-running server, otherwise start
// one and tear it down when the capture finishes.
// ---------------------------------------------------------------------------
async function isUp(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(BASE_URL + '/', { signal: ctrl.signal });
    clearTimeout(t);
    return res.status < 500;
  } catch {
    return false;
  }
}

async function ensureDevServer(): Promise<() => Promise<void>> {
  if (await isUp()) return async () => {}; // reuse existing
  const proc: ChildProcess = spawn('npm', ['run', 'dev'], {
    cwd: ROOT_DIR,
    detached: true,
    stdio: 'ignore',
  });
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) throw new Error('vite dev server exited during startup (code ' + proc.exitCode + ')');
    if (await isUp()) {
      return async () => {
        try { process.kill(-(proc.pid as number), 'SIGTERM'); } catch { /* noop */ }
      };
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  try { process.kill(-(proc.pid as number), 'SIGTERM'); } catch { /* noop */ }
  throw new Error('vite dev server did not become ready on ' + BASE_URL + ' (ENOSPC/inotify?) in time');
}

// ---------------------------------------------------------------------------
// Tauri IPC mock. Injected BEFORE any app script runs via addInitScript.
// ---------------------------------------------------------------------------
const TAURI_MOCK = `
(() => {
  if (window.__BUG_HUNT_MOCK__) return; // idempotent
  const callbacks = new Map();
  const listeners = new Map(); // eventName -> Set<handlerId>
  let cbSeq = 0;
  const cbPrefix = '__cb_' + Math.random().toString(36).slice(2, 8) + '_';

  const inter = {
    transformCallback: (cb, once) => {
      const id = cbPrefix + (++cbSeq);
      callbacks.set(id, { cb, once });
      return id;
    },
    unregisterCallback: (id) => { callbacks.delete(id); },
    invoke: (cmd, args, options) => {
      args = args || {};

      // Tauri event plugin commands (used by @tauri-apps/api/event listen/emit)
      if (cmd === 'plugin:event|listen') {
        listeners.set(args.event, listeners.get(args.event) || new Set());
        listeners.get(args.event).add(args.handler);
        return Promise.resolve(args.handler);
      }
      if (cmd === 'plugin:event|unlisten') {
        (listeners.get(args.event) || new Set()).delete(args.handler);
        return Promise.resolve();
      }

      const handler = window.__BUG_HUNT_MOCK__?.handlers?.[cmd];
      if (typeof handler === 'function') {
        try { return Promise.resolve(handler(args)); }
        catch (err) { return Promise.reject(err); }
      }
      // Unknown command => benign default, logged as console.warn (not error)
      console.warn('__MOCK_UNHANDLED__ ' + cmd);
      return Promise.resolve(null);
    },
    convertFileSrc: (path, protocol) => {
      return window.__BUG_HUNT_MOCK__?.convertFileSrc
        ? window.__BUG_HUNT_MOCK__.convertFileSrc(path, protocol)
        : 'asset://' + (path || '');
    },
  };

  window.__TAURI_INTERNALS__ = inter;

  window.__BUG_HUNT_EMIT__ = (event, payload) => {
    const ids = listeners.get(event) || new Set();
    for (const id of ids) {
      const c = callbacks.get(id);
      if (c) { try { c.cb(payload); } catch (e) { console.error('__MOCK_EMIT_ERR__', e); } }
    }
  };

  window.__BUG_HUNT_MOCK__ = window.__BUG_HUNT_MOCK__ || {};
  // Event-plugin internals used by @tauri-apps/api/event to unlisten.
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = window.__TAURI_EVENT_PLUGIN_INTERNALS__ || {};
  window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener =
    window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener ||
    function (event, eventId) {
      /* no-op; listener registry lives in the mock below */
    };
  // Default handlers available from app mount (so mount-time checks succeed).
  window.__BUG_HUNT_MOCK__.handlers = window.__BUG_HUNT_MOCK__.handlers || {};
  window.__BUG_HUNT_MOCK__.convertFileSrc = window.__BUG_HUNT_MOCK__.convertFileSrc || (() => '');
  const $d = (obj) => Object.assign(window.__BUG_HUNT_MOCK__.handlers, obj);
  $d({
    check_dependencies: () => ({ffmpeg:{available:null},sox:{available:null},python:{available:null},cuda:{unavailable:null},mps:{unavailable:null},model_count:2}),
    get_sidecar_status: () => ({isHealthy:true,pythonFound:true,modelDirectory:'/tmp/models',modelCount:2,errors:[],gpuAvailable:false,demucsAvailable:true,bsRoformerAvailable:true,sidecarScriptFound:true}),
    validate_environment: () => ({isReady:true,warnings:[],ffmpeg:{available:null},ffprobe:{available:null},python:{available:null},pythonVersion:'3.11',pytorch:{available:null},demucs:{available:null},cuda:{unavailable:null},sidecarScript:{available:null}}),
    get_models: () => [
      {id:'bs_roformer',name:'BS-Roformer',description:'Best overall quality',quality:'master',speed:'slow',gpu_required:false,status:'available',size_mb:2768},
      {id:'hdemucs',name:'Hybrid Demucs',description:'Fast and accurate',quality:'standard',speed:'medium',gpu_required:false,status:'available',size_mb:512},
      {id:'mdx_extra',name:'MDX Extra',description:'Extra music demixer',quality:'standard',speed:'fast',gpu_required:true,status:'available',size_mb:512},
      {id:'demucs',name:'Demucs',description:'Baseline model',quality:'draft',speed:'fast',gpu_required:false,status:'available',size_mb:512},
    ],
    list_downloaded_models: () => [],
    get_available_installers: () => [],
    get_install_manifest: () => ({}),
    get_inference_provider_config: () => ({active_provider:'local',replicate_version_hash:null,batch_parallel:false,cloud_duration_warn_minutes:15,cloud_duration_hard_cap_minutes:null,privacy_notice_shown:true}),
    list_library_roots: () => [],
    get_library_orphans: () => [],
    find_duplicate_stems: () => [],
    scan_library: () => ({added:0,updated:0}),
    get_batch_queue_status: () => ({running:false,queued:0}),
  });
})();
`;

// ---------------------------------------------------------------------------
// Layout / overflow checks (programmatic, fail loud).
// ---------------------------------------------------------------------------
function layoutCheckScript() {
  return `(() => {
    const vw = window.innerWidth;
    const doc = document.documentElement;
    const violations = [];

    const hOverflow = doc.scrollWidth > vw + 2;
    if (hOverflow) violations.push('horizontal overflow: doc.scrollWidth=' + doc.scrollWidth + ' > viewport ' + vw);

    const body = document.body;
    if (body && body.scrollWidth > vw + 2) violations.push('body horizontal overflow: ' + body.scrollWidth + ' > ' + vw);

    const main = document.querySelector('main');
    if (main) {
      const mr = main.getBoundingClientRect();
      if (mr.right > vw + 2) violations.push('main overflows right edge by ' + Math.round(mr.right - vw) + 'px');
      if (mr.left < -2) violations.push('main overflows left edge');
    }

    // Detect elements whose right edge spills beyond viewport (excluding sr-only / hidden).
    const offscreen = [];
    document.querySelectorAll('body *').forEach((el) => {
      const st = window.getComputedStyle(el);
      if (st.position === 'fixed') return;
      if (st.visibility === 'hidden' || st.display === 'none') return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.right > vw + 4 && r.left < vw) {
        offscreen.push((el.getAttribute('data-testid') || el.className?.toString().slice(0,40) || el.tagName) + ' right=' + Math.round(r.right));
      }
    });
    violations.push(...offscreen.slice(0, 8).map((s) => 'element overflow: ' + s));

    // Overlap detection on key interactive rows (same container children).
    function overlaps(a, b) {
      return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
    }
    const containers = [
      '[data-testid="file-list"] [role="list"]',
      'main section',
      '[data-testid="job-item"]',
    ];
    const overlapNotes = [];
    for (const sel of containers) {
      const parents = document.querySelectorAll(sel);
      for (const parent of Array.from(parents).slice(0, 6)) {
        const items = Array.from(parent.children).filter((c) => {
          const r = c.getBoundingClientRect();
          return r.width > 2 && r.height > 2;
        });
        for (let i = 0; i < items.length; i++) {
          for (let j = i + 1; j < items.length; j++) {
            const a = items[i].getBoundingClientRect();
            const b = items[j].getBoundingClientRect();
            if (overlaps(a, b)) {
              overlapNotes.push('overlap: ' + (items[i].getAttribute('data-testid')||items[i].tagName) + ' & ' + (items[j].getAttribute('data-testid')||items[j].tagName));
            }
          }
        }
      }
    }
    violations.push(...overlapNotes.slice(0, 8));

    return {
      viewport: vw,
      hasHorizontalScrollbar: doc.scrollWidth > doc.clientWidth + 2,
      violations: Array.from(new Set(violations)).slice(0, 20),
    };
  })()`;
}

// ---------------------------------------------------------------------------
// Store seeding via Vite module graph (the app's real Zustand stores).
// ---------------------------------------------------------------------------
async function seedState(
  page: Page,
  opts: { state: string; view: string; theme: 'light' | 'dark'; wavUrl: string }
) {
  const { state, view, theme, wavUrl } = opts;
  // Build the page script as a STRING so tsx/esbuild never transforms it into
  // browser-incompatible (__name) JS.
  const script = `
(async () => {
  const app = await import('/src/stores/appStore.ts');
  const settings = await import('/src/stores/settingsStore.ts');
  settings.useSettingsStore.setState({theme: '${theme}', hasSeenFirstRun: true});
  app.useAppStore.setState({activeView: '${view}'});

  const mock = window.__BUG_HUNT_MOCK__;
  mock.convertFileSrc = () => '${wavUrl}';

  // Seed-specific command stubs (merge over mount-time defaults).
  Object.assign(mock.handlers, {
    get_processing_history: () => [],
    read_stem_metadata: () => null,
    get_audio_info: (a) => { const n = ((a&&a.path)||'/tmp/dummy.wav').split(/[/\\\\]/).pop()||'track.wav'; return {path:(a&&a.path)||'/tmp/dummy.wav',name:n,format:'wav',size:1048576,duration:235,sample_rate:44100,channels:2,bitrate:320,sample_width:16}; },
    add_to_history: () => null,
    get_fonts: () => [],
    export_library_report: () => '/tmp/report.csv',
    get_staleness_rules: () => ({}),
  });

  const stems = [
    {id:'drums',type:'drums',name:'Drums',volume:1,muted:false,solo:false,color:'#3b82f6',file_path:'/tmp/drums.wav'},
    {id:'bass',type:'bass',name:'Bass',volume:1,muted:false,solo:false,color:'#22c55e',file_path:'/tmp/bass.wav'},
    {id:'other',type:'other',name:'Other',volume:1,muted:false,solo:false,color:'#a855f7',file_path:'/tmp/other.wav'},
    {id:'vocals',type:'vocals',name:'Vocals',volume:1,muted:false,solo:false,color:'#f59e0b',file_path:'/tmp/vocals.wav'},
  ];

  switch ('${state}') {
    case 'history':
      mock.handlers.get_processing_history = () => ([
        {id:'h1',source_path:'/tmp/sunrise.wav',output_path:'/tmp/sunrise.stem.mp4',model:'BS-Roformer',dj_preset:'Traktor',processed_at:new Date().toISOString(),duration_ms:182000,file_size:5120000},
        {id:'h2',source_path:'/tmp/bassline.mp3',output_path:'/tmp/bassline.stem.mp4',model:'MDX',dj_preset:'rekordbox',processed_at:new Date(Date.now()-86400000).toISOString(),duration_ms:244000,file_size:3145728},
      ]);
      break;
    case 'history_empty':
      mock.handlers.get_processing_history = () => ([]);
      break;
    case 'browser_files':
      app.useAppStore.setState({audioFiles:[
        {path:'/tmp/sunrise.wav',name:'sunrise_demo.wav',format:'wav',size:5242880,duration:182,sample_rate:44100,channels:2,bitrate:320,sample_width:16},
        {path:'/tmp/bassline.mp3',name:'bassline_128.mp3',format:'mp3',size:3145728,duration:244,sample_rate:44100,channels:2,bitrate:128,sample_width:16},
      ]});
      break;
    case 'dragover':
      app.useAppStore.setState({audioFiles:[]});
      break;
    case 'processing':
      app.useAppStore.setState({
        isProcessing:true, currentJobId:'job-1',
        jobs:[
          {id:'job-1',input_path:'/tmp/sunrise.wav',output_path:'/tmp/sunrise.stem.mp4',model:'BS-Roformer',status:'processing',progress:0.42,error:null,created_at:Date.now()-30000,duration_sec:null,file_size:null},
          {id:'job-2',input_path:'/tmp/bassline.mp3',output_path:'/tmp/bassline.stem.mp4',model:'MDX',status:'pending',progress:0,error:null,created_at:Date.now()-20000,duration_sec:null,file_size:null},
        ],
      });
      break;
    case 'mixer':
    case 'mixer_muted':
    case 'mixer_soloed':
    case 'mixer_80':
      if ('${state}' === 'mixer_muted') stems[1].muted = true;
      if ('${state}' === 'mixer_soloed') stems[0].solo = true;
      if ('${state}' === 'mixer_80') stems.forEach(function(s){ s.volume = 0.8; });
      app.useAppStore.setState({
        currentStems: stems,
        selectedFile:{path:'/tmp/sunrise.wav',name:'sunrise_demo.wav',format:'wav',size:5242880,duration:182,sample_rate:44100,channels:2,bitrate:320,sample_width:16},
      });
      break;
  }
  return 'seeded';
})()`;
  await page.evaluate(script);
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
interface ShotSpec { state: string; view: string; label: string; mobile?: boolean }

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

const allStates: ShotSpec[] = [
  { state: 'home_empty', view: 'files' },
  { state: 'browser_files', view: 'files' },
  { state: 'dragover', view: 'files' },
  { state: 'processing', view: 'queue' },
  { state: 'mixer', view: 'mixer' },
  { state: 'mixer_muted', view: 'mixer' },
  { state: 'mixer_soloed', view: 'mixer' },
  { state: 'mixer_80', view: 'mixer' },
  { state: 'settings', view: 'settings' },
  { state: 'history', view: 'files' },
  { state: 'history_empty', view: 'files' },
  { state: 'error', view: 'files' },
];

const themes: Array<'light' | 'dark'> = ['light', 'dark'];

async function captureState(
  browser: Browser,
  spec: ShotSpec,
  theme: 'light' | 'dark',
  opts: { runLayout: boolean; wantMobile: boolean }
) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  const context: BrowserContext = await browser.newContext({
    viewport: DESKTOP,
    deviceScaleFactor: 1,
  });

  // Inject Tauri mock before any app script (fresh each navigation).
  await context.addInitScript(TAURI_MOCK);

  const page: Page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  try {
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await seedState(page, { state: spec.state, view: spec.view, theme, wavUrl: BASE_URL + FIXTURE_WAV });

    // Wait for app shell.
    await page.waitForSelector('[data-testid="nav-files"]', { timeout: 15000 });

    // Navigate to target view via the real sidebar (exercises real interaction).
    const navSel = spec.view === 'files' ? null : `[data-testid="nav-${spec.view}"]`;
    if (navSel) {
      const nav = page.locator(navSel);
      if (await nav.count()) {
        await nav.click();
      } else {
        // Sidebar may be collapsed/hidden; fall back to store-driven setActiveView.
        await page.evaluate(async (v) => {
          const m = await import('/src/stores/appStore.ts');
          m.useAppStore.setState({ activeView: v });
        }, spec.view);
      }
    }

    // State-specific interactions.
    if (spec.state === 'dragover') {
      // Highlight the drop zone, then capture while it's active.
      await page.dispatchEvent('[data-testid="drop-zone"]', 'dragover', {});
      await page.waitForTimeout(400);
    }
    if (spec.state.startsWith('history')) {
      // History is exported but not routed to any nav view. Mount the REAL
      // ProcessingHistory component in isolation using the app's module graph.
      await page.evaluate(`(async () => {
        const React = (await import('/node_modules/.vite/deps/react.js')).default;
        const clientMod = await import('/node_modules/.vite/deps/react-dom_client.js');
        const createRoot = (clientMod.createRoot || clientMod.default.createRoot);
        const { ProcessingHistory } = await import('/src/components/history/ProcessingHistory.tsx');
        const host = document.createElement('div');
        host.id = 'history-host';
        host.style.cssText = 'padding:24px;min-height:100vh;box-sizing:border-box';
        document.body.insertBefore(host, document.body.firstChild);
        // hide the existing app shell to avoid double screenshot clutter
        const appShells = document.querySelectorAll('#root > *');
        appShells.forEach((el) => { if (el.id !== 'history-host') el.style.display = 'none'; });
        createRoot(host).render(React.createElement(ProcessingHistory));
      })()`);
      await page.waitForTimeout(1500);
    }
    if (spec.state === 'error') {
      // Trigger a visible error banner via the sidecar-deploy-error event.
      await page.evaluate(() => {
        window.__BUG_HUNT_EMIT__('sidecar-deploy-error', { error: 'Injected test error: model file missing' });
      });
      await page.waitForTimeout(400);
    }
    if (spec.view === 'mixer' && spec.state !== 'mixer') {
      // Ensure the mixer player loads stems (uses real audio decode from fixture).
      await page.waitForTimeout(2500);
    }

    // Wait for render settle.
    await page.waitForTimeout(1200);

    // Capture console log (append) and layout.
    const stateKey = spec.state + '_' + theme;
    appendFileSync(join(SHOT_DIR, 'console-errors.log'), `\n--- ${stateKey} ---\n`);
    for (const e of consoleErrors) appendFileSync(join(SHOT_DIR, 'console-errors.log'), 'CONSOLE: ' + e + '\n');
    for (const e of pageErrors) appendFileSync(join(SHOT_DIR, 'console-errors.log'), 'PAGE: ' + e + '\n');

    let layout: any = { violations: [] };
    if (opts.runLayout) {
      layout = await page.evaluate(layoutCheckScript());
      if (layout.violations && layout.violations.length) {
        appendFileSync(join(SHOT_DIR, 'layout-violations.txt'), `\n--- ${stateKey} ---\n`);
        for (const v of layout.violations) appendFileSync(join(SHOT_DIR, 'layout-violations.txt'), v + '\n');
      }
    }

    // Screenshots.
    const shot = join(SHOT_DIR, `${stateKey}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    console.log(`  ✓ ${stateKey}.png`);

    if (opts.wantMobile) {
      await page.setViewportSize(MOBILE);
      await page.waitForTimeout(800);
      const mShot = join(SHOT_DIR, `${stateKey}_mobile.png`);
      await page.screenshot({ path: mShot, fullPage: true });
      console.log(`  ✓ ${stateKey}_mobile.png`);
    }
  } catch (err: any) {
    const mainShot = join(SHOT_DIR, `${spec.state}_${theme}.png`);
    if (existsSync(mainShot)) {
      // Transient browser/teardown crash AFTER the screenshots were saved is not
      // a capture failure — do not flag it (would mislead the harness).
      console.warn(`  ⚠ post-capture teardown error for ${spec.state}_${theme}: ${err?.message || err} (screenshot saved)`);
    } else {
      console.error(`  ✗ capture failed for ${spec.state}_${theme}:`, err?.message || err);
      writeFileSync(join(SHOT_DIR, `FAIL_${spec.state}_${theme}.txt`), String(err));
    }
  } finally {
    await context.close();
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const only = argv.find((a) => a.startsWith('--state='))?.split('=')[1];
  const runLayout = !argv.includes('--no-layout');
  const wantMobile = !argv.includes('--no-mobile');

  const stopServer = await ensureDevServer();

  const browser = await chromium.launch({
    // Prefer the NixOS system Chromium when present (bundled Playwright
    // binaries cannot run on NixOS); otherwise fall back to Playwright's own
    // bundled Chromium (e.g. GitHub Actions, plain Linux).
    ...(existsSync(CHROMIUM_PATH) ? { executablePath: CHROMIUM_PATH } : {}),
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream'],
  });

  try {
    const targets = allStates.filter((s) => !only || s.state === only);

    for (const theme of themes) {
      for (const spec of targets) {
        console.log(`Capturing ${spec.state} (${theme})`);
        await captureState(browser, spec, theme, { runLayout, wantMobile });
      }
    }
  } finally {
    await browser.close();
    await stopServer();
  }

  // Final summary.
  const layFile = join(SHOT_DIR, 'layout-violations.txt');
  const hasLayout = existsSync(layFile) && readFileSync(layFile, 'utf8').trim().length > 0;
  if (hasLayout) {
    console.error('\n⚠  LAYOUT/OVERFLOW VIOLATIONS DETECTED:');
    console.error(readFileSync(layFile, 'utf8'));
    process.exitCode = 1;
  }
  console.log('\nDone. Screenshots ->', SHOT_DIR);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
