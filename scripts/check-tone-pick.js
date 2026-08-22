/**
 * Android's ringtone picker answers with a Uri, and only some of a Uri survives
 * the crossing into JavaScript. These cases pin down what counts as an answer:
 * take too little and a chosen tone is silently dropped, take too much and a
 * scrap of an Intent gets saved as a tone address that can never ring.
 *
 *   node scripts/check-tone-pick.js   (see package.json check:tone)
 */

const path = require('path');

// Argument first: naming it inline in the npm script (VAR=x node …) is shell
// syntax Windows does not have.
const OUT = process.argv[2] || process.env.TONE_OUT || '.tmp-tone';

// Sole file in the build, so tsc drops it straight in without the src/ tree.
const { pickedToneUri, looksLikeUri } = require(path.join(process.cwd(), OUT, 'toneUri.js'));

const PICKED = 'android.intent.extra.ringtone.PICKED_URI';

let failed = 0;
function check(name, got, want) {
  const ok = got === want;
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok ' : 'FAIL'} ${name}${ok ? '' : `  (got ${got}, want ${want})`}`);
}

console.log('-- the address arrives as a string --');
check(
  'a tone from the media store',
  pickedToneUri({ extra: { [PICKED]: 'content://media/internal/audio/media/108' } }),
  'content://media/internal/audio/media/108',
);
check(
  "the phone's default alarm",
  pickedToneUri({ extra: { [PICKED]: 'content://settings/system/alarm_alert' } }),
  'content://settings/system/alarm_alert',
);
check(
  'a tone sitting in a file',
  pickedToneUri({ extra: { [PICKED]: 'file:///storage/emulated/0/Music/wake.mp3' } }),
  'file:///storage/emulated/0/Music/wake.mp3',
);
check(
  'surrounding space is trimmed off',
  pickedToneUri({ extra: { [PICKED]: '  content://media/external/audio/media/5\n' } }),
  'content://media/external/audio/media/5',
);

console.log('-- the address arrives as an object --');
check(
  'a Uri that kept its fields',
  pickedToneUri({ extra: { [PICKED]: { uri: 'content://media/internal/audio/media/7' } } }),
  'content://media/internal/audio/media/7',
);
check(
  'a Uri that can only be read by printing it',
  pickedToneUri({
    extra: {
      [PICKED]: { toString: () => 'content://media/internal/audio/media/9' },
    },
  }),
  'content://media/internal/audio/media/9',
);

console.log('-- the address arrives only in the Intent --');
check(
  'dug out of a printed Intent',
  pickedToneUri({ data: 'Intent { dat=content://media/internal/audio/media/33 flg=0x1 }' }),
  'content://media/internal/audio/media/33',
);
check(
  'dug out when the Intent names an action too',
  pickedToneUri({
    data: 'Intent { act=android.intent.action.RINGTONE_PICKER dat=content://settings/system/alarm_alert }',
  }),
  'content://settings/system/alarm_alert',
);
check(
  'data that is already just the address',
  pickedToneUri({ data: 'content://media/internal/audio/media/2' }),
  'content://media/internal/audio/media/2',
);
check(
  'the extra is preferred over the Intent',
  pickedToneUri({
    data: 'Intent { dat=content://media/internal/audio/media/1 }',
    extra: { [PICKED]: 'content://media/internal/audio/media/2' },
  }),
  'content://media/internal/audio/media/2',
);

console.log('-- nothing usable came back --');
check('an empty reply', pickedToneUri({}), null);
check('an empty extras bag', pickedToneUri({ extra: {} }), null);
check('the tone was left silent', pickedToneUri({ extra: { [PICKED]: null } }), null);
check(
  'an Intent with no data on it',
  pickedToneUri({ data: 'Intent { act=android.intent.action.RINGTONE_PICKER flg=0x1 }' }),
  null,
);
check(
  'a printed object that is not a Uri at all',
  pickedToneUri({ extra: { [PICKED]: { type: 4 } } }),
  null,
);
check(
  'a bare word is not an address',
  pickedToneUri({ extra: { [PICKED]: 'default' } }),
  null,
);
check(
  'a web address is not a tone on this phone',
  pickedToneUri({ extra: { [PICKED]: 'https://example.com/wake.mp3' } }),
  null,
);

console.log('-- what counts as an address --');
check('content', looksLikeUri('content://settings/system/alarm_alert'), true);
check('an app resource', looksLikeUri('android.resource://com.kashio.app/raw/alarm'), true);
check('an Intent print-out', looksLikeUri('Intent { dat=content://x }'), false);
check('nothing at all', looksLikeUri(undefined), false);

console.log(failed ? `\n${failed} failing` : '\nall good');
process.exit(failed ? 1 : 0);
