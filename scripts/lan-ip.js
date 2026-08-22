/**
 * Works out the address a phone on the same Wi-Fi can reach this machine at.
 *
 * Expo asks `lan-network` for this, and when that call throws it quietly falls
 * back to 127.0.0.1, which a phone can never reach. The throw comes and goes
 * with VPN and Wi-Fi state, so the dev server is reachable one launch and not
 * the next with nothing in the output to say why.
 *
 * Answers null when there is nothing worth trusting, so the caller can leave
 * the question to Expo rather than pin the wrong address.
 *
 *   node scripts/lan-ip.js     (prints the address, or nothing)
 */

const os = require('os');

// A VPN, emulator or container leaves addresses behind that answer on this
// machine but mean nothing to a phone across the room. Named for macOS, Linux
// and the friendly names Windows reports.
const UNREACHABLE_FROM_A_PHONE =
  /^(utun|tun\d|tap|ppp|bridge|awdl|llw|docker|vboxnet|vmnet|veth|vEthernet|VirtualBox|VMware|Hyper-V|Bluetooth|Loopback|Teredo|isatap)/i;

// Wi-Fi first, since that is the network a phone is most likely sharing, then
// wired, then the Linux spellings of both.
const PREFERRED_ORDER = [/^(wi-?fi|wlan|wl)/i, /^(ethernet|en\d|eth\d)/i];

function rank(name) {
  const index = PREFERRED_ORDER.findIndex((pattern) => pattern.test(name));
  return index === -1 ? PREFERRED_ORDER.length : index;
}

function candidates() {
  const found = [];
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
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

module.exports = { lanIp };

if (require.main === module) {
  const ip = lanIp();
  if (ip) process.stdout.write(ip);
}
