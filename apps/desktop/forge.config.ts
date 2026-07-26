import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { PublisherGithub } from '@electron-forge/publisher-github';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: 'bOtExE Studio',
    executableName: 'botexe-studio',
    // widget-kit + overlay-runtime liegen im Monorepo unter packages/ und werden
    // vom Overlay-Server als statische Files ausgeliefert. Landen als
    // <Resources>/widget-kit/ bzw. <Resources>/overlay-runtime/.
    extraResource: [
      'assets',
      path.resolve(__dirname, '../../packages/widget-kit'),
      path.resolve(__dirname, '../../packages/overlay-engine/runtime'),
      // Für das „Was ist neu?"-Popup — offline gelesen, kein GitHub-API-Call.
      path.resolve(__dirname, '../../CHANGELOG.md'),
    ],
    // npm prune funktioniert nicht sauber mit Workspaces — stattdessen
    // installieren wir production-deps im packageAfterCopy-Hook.
    prune: false,
    ignore: [
      /^\/node_modules$/,
      /^\/out$/,
      /^\/\.vite\/.*\.map$/,
      /\.gitignore$/,
      /\.eslintrc.*$/,
      /tsconfig.*$/,
      /vite\..*config\..*$/,
    ],
  },
  rebuildConfig: {},
  makers: [
    // Windows: Squirrel-Setup (.exe + .nupkg). Code-Sign-Cert kommt später —
    // bis dahin SmartScreen-Warnung.
    new MakerSquirrel({
      name: 'botexe-studio',
      authors: 'dotexe',
      description: 'Lokales TikTok-Live Overlay-Studio',
      // NICHT `remoteReleases` setzen — auch wenn es verlockend ist, weil es
      // Delta-Pakete brächte (~90 statt ~150 MB pro Update):
      // Damit listet die RELEASES-Datei die ganze Versions-Historie. Unser Updater
      // holt sie aber über update.electronjs.org, und der Dienst macht NUR aus der
      // ERSTEN Zeile eine absolute Adresse — angehängt ans NEUESTE Release. Die
      // erste Zeile ist dann die ÄLTESTE Version, deren Paket dort nicht liegt →
      // 404 → „Command failed: 4294967295", und das Auto-Update ist für ALLE tot.
      // Genau so passiert in v0.39.0 (zurückgenommen in v0.39.1).
      // Deltas gingen nur mit einem eigenen Feed, wo alle Pakete am selben Ort
      // liegen (z.B. UpdateSourceType.StaticStorage) — bewusst offen gelassen.
    }),
    new MakerZIP({}, ['linux']),
  ],
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'src/main.ts', config: 'vite.main.config.ts', target: 'main' },
        { entry: 'src/preload.ts', config: 'vite.preload.config.ts', target: 'preload' },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.ts' }],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      // Kein Child-Node-Prozess mehr (Alt-App brauchte RunAsNode für den
      // Editor-Server) → Fuse aus, kleinere Angriffsfläche.
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  publishers: [
    // GitHub-Releases als Update-Feed. `npm run publish` (in CI mit GITHUB_TOKEN)
    // lädt Squirrel-Artefakte (.exe + .nupkg + RELEASES) als Release hoch — die
    // App zieht daraus per Delta NUR die Änderungen, nicht den ganzen Ordner.
    // WICHTIG: Für Auto-Update ohne eigenen Server müssen die Releases öffentlich
    // sein (Repo public ODER ein public Release-Repo). Privat = kein Auto-Update.
    new PublisherGithub({
      repository: { owner: 'dOtExE97', name: 'botexe-studio' },
      prerelease: false,
      draft: false,
    }),
  ],
  hooks: {
    // Production-deps direkt in den kopierten App-Ordner installieren —
    // umgeht das Workspace-Hoisting. Keine nativen Module → kein rebuild nötig.
    packageAfterCopy: async (_forgeConfig, buildPath) => {
      const pkgPath = path.join(buildPath, 'package.json');
      if (!fs.existsSync(pkgPath)) {
        fs.copyFileSync(path.join(__dirname, 'package.json'), pkgPath);
      }
      // Workspace-Deps (@botexe/*) sind im Bundle bereits einkompiliert —
      // aus dem package.json im Build-Ordner entfernen, sonst schlägt
      // npm install fehl (kein Registry-Paket).
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      for (const dep of Object.keys(pkg.dependencies ?? {})) {
        if (dep.startsWith('@botexe/')) delete pkg.dependencies[dep];
      }
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
      execSync('npm install --omit=dev --no-workspaces --no-audit --no-fund', {
        cwd: buildPath,
        stdio: 'inherit',
      });
    },
  },
};

export default config;
