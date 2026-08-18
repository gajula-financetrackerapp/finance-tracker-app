import { withAlpha } from '../src/utils/buildTheme';
import { THEMES } from '../src/constants';

let fail = 0;
function check(label: string, cond: boolean) {
  if (!cond) fail++;
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}`);
}

const isColor = (c: string) =>
  /^#[0-9A-Fa-f]{6}$/.test(c) || /^#[0-9A-Fa-f]{8}$/.test(c) || /^rgba?\(/.test(c);

check('a plain hex takes the alpha', withAlpha('#1FA7A3', '99') === '#1FA7A399');

// accentSoft already carries an alpha, so appending again would make a
// ten-character string that React Native cannot parse.
check('a hex that already has alpha is left alone', withAlpha('#1FA7A326', '99') === '#1FA7A326');
check('rgba is left alone', withAlpha('rgba(0,0,0,0.5)', '99') === 'rgba(0,0,0,0.5)');
check('a named colour is left alone', withAlpha('transparent', '99') === 'transparent');

// Every theme must survive the borders we build from it.
for (const theme of Object.values(THEMES)) {
  check(
    `${theme.label}: faded primary is a usable colour`,
    isColor(withAlpha(theme.primary, '99')),
  );
  check(`${theme.label}: accentSoft is a usable colour`, isColor(theme.accentSoft));
  check(
    `${theme.label}: fading accentSoft cannot go wrong`,
    isColor(withAlpha(theme.accentSoft, '99')),
  );
}

console.log(fail === 0 ? '\nall passed' : `\n${fail} failed`);
