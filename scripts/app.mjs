#!/usr/bin/env node
/**
 * Prepara o app nativo de uma versão do jogo.
 *   node scripts/app.mjs full   → jogo completo (br.com.frentedeferro.rts)
 *   node scripts/app.mjs demo   → demo (br.com.frentedeferro.demo)
 * Faz: build web da versão, ícones e tela de abertura, `cap sync`, id/nome/versão no Android e no iOS.
 * Depois: `npx cap open android` (Android Studio) ou `npx cap open ios` (Xcode, só no Mac).
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const flavor = process.argv[2] === 'demo' ? 'demo' : 'full';
const only = process.argv[3]; // opcional: android | ios
const demo = flavor === 'demo';
const id = demo ? 'br.com.frentedeferro.demo' : 'br.com.frentedeferro.rts';
const name = demo ? 'Frente de Ferro Demo' : 'Frente de Ferro';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const [ma, mi, pa] = pkg.version.split('.').map(Number);
const code = Number(process.env.BUILD_NUMBER || ma * 10000 + mi * 100 + pa); // versionCode / CFBundleVersion
const env = { ...process.env, APP_FLAVOR: flavor, VITE_DEV_BILLING: '0' };
const run = cmd => { console.log('› ' + cmd); execSync(cmd, { stdio: 'inherit', env }); };
const edit = (file, fn) => { if (!existsSync(file)) return; const s = readFileSync(file, 'utf8'), t = fn(s); if (t !== s) writeFileSync(file, t); };

console.log(`\n=== ${name} ${pkg.version} (build ${code}) ===`);
run(demo ? 'npx vite build --mode demo' : 'npx vite build');
const plats = only ? [only] : ['android', 'ios'];
for (const p of plats) if (existsSync(p)) run(`npx cap sync ${p}`);
run(`npx capacitor-assets generate --assetPath assets-app/${flavor} ${plats.map(p => '--' + p).join(' ')} --iconBackgroundColor "#1c1c18" --iconBackgroundColorDark "#1c1c18" --splashBackgroundColor "#121210" --splashBackgroundColorDark "#121210"`);

// Android: id do app, nome, versão
edit('android/app/build.gradle', s => s
  .replace(/applicationId "[^"]+"/, `applicationId "${id}"`)
  .replace(/versionCode \d+/, `versionCode ${code}`)
  .replace(/versionName "[^"]+"/, `versionName "${pkg.version}"`));
edit('android/app/src/main/res/values/strings.xml', s => s
  .replace(/(<string name="app_name">)[^<]*/, `$1${name}`)
  .replace(/(<string name="title_activity_main">)[^<]*/, `$1${name}`)
  .replace(/(<string name="package_name">)[^<]*/, `$1${id}`)
  .replace(/(<string name="custom_url_scheme">)[^<]*/, `$1${id}`));
// iOS: bundle id, nome exibido, versão
edit('ios/App/App.xcodeproj/project.pbxproj', s => s
  .replace(/PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g, `PRODUCT_BUNDLE_IDENTIFIER = ${id};`)
  .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${pkg.version};`)
  .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${code};`));
edit('ios/App/App/Info.plist', s => s.replace(/(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*/, `$1${name}`));
console.log(`\nPronto: ${name} → ${id}. Abra com "npx cap open android" ou "npx cap open ios".`);
