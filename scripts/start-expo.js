/**
 * Starts Expo with the dev server pointed at an address a phone can reach.
 *
 * Setting the variable inline in an npm script (`VAR=value expo start`) is
 * Unix-only shell syntax, and Windows reads it as the name of a program. Doing
 * it here keeps one command working on every machine, and calling Expo's CLI
 * file with node avoids the .cmd/.sh shim differences between platforms too.
 *
 *   node scripts/start-expo.js --dev-client
 */

const { spawn } = require('child_process');
const { lanIp } = require('./lan-ip');

const args = process.argv.slice(2);

// An address the developer set by hand always wins.
if (!process.env.REACT_NATIVE_PACKAGER_HOSTNAME) {
  const ip = lanIp();
  if (ip) {
    process.env.REACT_NATIVE_PACKAGER_HOSTNAME = ip;
    console.log(`Serving to phones at ${ip}`);
  } else {
    console.warn(
      'Could not work out this machine\'s address on the network, so Expo will ' +
        'choose one. If the QR code points at 127.0.0.1, your phone cannot reach ' +
        'it: run `node scripts/lan-ip.js --why` to see what this machine reported, ' +
        'connect over USB, or set REACT_NATIVE_PACKAGER_HOSTNAME yourself.'
    );
  }
}

// stdio 'inherit' hands over the real terminal, which is what makes Expo draw
// the QR code and take keypresses instead of printing its quiet CI output.
const child = spawn(process.execPath, [require.resolve('expo/bin/cli'), 'start', ...args], {
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error(`Could not start Expo: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  // Ctrl+C is how this is meant to end, so report it as a clean stop.
  if (signal) process.exit(signal === 'SIGINT' || signal === 'SIGTERM' ? 0 : 1);
  process.exit(code ?? 0);
});
