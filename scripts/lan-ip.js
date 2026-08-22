/**
 * Prints the address a phone on the same Wi-Fi can reach this machine at.
 *
 * Expo asks `lan-network` for this, and when that call throws it quietly falls
 * back to 127.0.0.1, which a phone can never reach. The throw comes and goes
 * with VPN and Wi-Fi state, so the dev server is reachable one launch and not
 * the next with nothing in the output to say why.
 *
 * Prints nothing when there is no answer worth trusting. An empty
 * REACT_NATIVE_PACKAGER_HOSTNAME is ignored by Expo, so a silent failure here
 * simply hands the question back to Expo rather than pinning the wrong address.
 *
 *   node scripts/lan-ip.js
 */

const os = require('os');

// A VPN or container leaves addresses behind that answer on this machine but
// mean nothing to a phone across the room.
const UNREACHABLE_FROM_A_PHONE = /^(utun|tun|tap|ppp|bridge|awdl|llw|docker|vboxnet|vmnet)/;

// Wired and Wi-Fi first on macOS, then Linux naming, so a machine on both picks
// the one a phone is likely sharing.
const PREFERRED_ORDER = [/^en\d/, /^eth\d/, /^wl/];

function candidates() {
  const found = [];
  const interfaces = os.networkInterfaces();
  for (const [name, addresses] of Object.entries(interfaces)) {
    if (UNREACHABLE_FROM_A_PHONE.test(name)) continue;
    for (const address of addresses || []) {
      // Node <18 reported family as a number, newer ones as a string.
      const isIPv4 = address.family === 'IPv4' || address.family === 4;
      if (!isIPv4 || address.internal) continue;
      // 169.254.x.x is what a machine invents when nothing handed it an address.
      if (address.address.startsWith('169.254.')) continue;
      found.push({ name, address: address.address });
    }
  }
  return found;
}

function rank(name) {
  const index = PREFERRED_ORDER.findIndex((pattern) => pattern.test(name));
  return index === -1 ? PREFERRED_ORDER.length : index;
}

function lanIp() {
  // Expo's own answer, when it is willing to give one.
  try {
    const { lanNetworkSync } = require('lan-network');
    const lan = lanNetworkSync();
    if (lan && lan.address && !UNREACHABLE_FROM_A_PHONE.test(lan.iname || '')) {
      return lan.address;
    }
  } catch {
    // Falls through to reading the interfaces directly.
  }

  const found = candidates();
  if (!found.length) return null;
  found.sort((a, b) => rank(a.name) - rank(b.name));
  return found[0].address;
}

const ip = lanIp();
if (ip) process.stdout.write(ip);
