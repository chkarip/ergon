// Dev launcher — strips ELECTRON_RUN_AS_NODE so Electron initialises properly.
// This env var is set globally on this machine (used by other tools) and causes
// the Electron binary to run as plain Node.js, breaking require('electron').
const { spawn } = require('child_process');
const path = require('path');

const electronBin = path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe');
const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;

const isDev = process.argv.includes('--dev') || process.argv[2] === 'dev';
const args = isDev ? ['.', '--dev'] : ['.'];

const child = spawn(electronBin, args, { env, stdio: 'inherit', cwd: __dirname });
child.on('close', code => process.exit(code || 0));
