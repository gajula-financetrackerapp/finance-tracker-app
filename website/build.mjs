import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const appAssets = path.resolve(root, '../assets');
const siteUrl = 'https://moneylit.gaincreations.com';
const playUrl = 'https://play.google.com/store/apps/details?id=com.gajula.moneylit';
const supportEmail = 'gajulaallinonefinancetracker@gmail.com';

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'assets'), { recursive: true });

await Promise.all([
  cp(path.join(appAssets, 'play/store-icon-512.png'), path.join(dist, 'assets/moneylit-icon.png')),
  cp(path.join(appAssets, 'onboarding/home.jpg'), path.join(dist, 'assets/home.jpg')),
  cp(path.join(appAssets, 'onboarding/charts-expenses.jpg'), path.join(dist, 'assets/charts.jpg')),
  cp(path.join(appAssets, 'onboarding/reminders.jpg'), path.join(dist, 'assets/reminders.jpg')),
  cp(path.join(appAssets, 'onboarding/split.jpg'), path.join(dist, 'assets/split.jpg')),
  cp(path.join(appAssets, 'onboarding/buy-list.jpg'), path.join(dist, 'assets/buy-list.jpg')),
  cp(path.join(root, 'src/styles.css'), path.join(dist, 'styles.css')),
  cp(path.join(root, 'src/site.js'), path.join(dist, 'site.js')),
]);

const routes = {
  home: '/',
  about: '/about/',
  privacy: '/privacy-policy/',
  terms: '/terms-of-service/',
  deletion: '/account-deletion/',
  contact: '/contact/',
};

function nav(active) {
  return `
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header">
      <div class="nav-wrap">
        <a class="brand" href="/" aria-label="MoneyLit home">
          <img src="/assets/moneylit-icon.png" alt="" width="46" height="46">
          <span>Money<em>Lit</em></span>
        </a>
        <button class="menu-toggle" type="button" data-menu-toggle aria-expanded="false" aria-controls="site-nav" aria-label="Open navigation">☰</button>
        <nav class="nav-links" id="site-nav" data-nav aria-label="Main navigation">
          <a href="/" ${active === 'home' ? 'aria-current="page"' : ''}>Home</a>
          <a href="/about/" ${active === 'about' ? 'aria-current="page"' : ''}>About</a>
          <a href="/#features">Features</a>
          <details class="legal-menu">
            <summary>Privacy &amp; Legal</summary>
            <div class="legal-dropdown">
              <a href="/privacy-policy/">Privacy Policy</a>
              <a href="/account-deletion/">Account Deletion</a>
              <a href="/terms-of-service/">Terms of Service</a>
            </div>
          </details>
          <a href="/contact/" ${active === 'contact' ? 'aria-current="page"' : ''}>Contact</a>
          <a class="nav-cta" href="${playUrl}" target="_blank" rel="noopener">Get MoneyLit</a>
        </nav>
      </div>
    </header>`;
}

function footer() {
  return `
    <footer class="footer">
      <div class="container">
        <div class="footer-grid">
          <div>
            <h3>MoneyLit</h3>
            <p>A practical personal finance organiser by GAIN Creations — Gajula Alliance for Innovation &amp; NextGen Creations.</p>
          </div>
          <div>
            <h3>Explore</h3>
            <div class="footer-links">
              <a href="/">Home</a>
              <a href="/about/">About</a>
              <a href="${playUrl}" target="_blank" rel="noopener">Google Play</a>
              <a href="/contact/">Contact</a>
            </div>
          </div>
          <div>
            <h3>Privacy &amp; Legal</h3>
            <div class="footer-links">
              <a href="/privacy-policy/">Privacy Policy</a>
              <a href="/account-deletion/">Account Deletion</a>
              <a href="/terms-of-service/">Terms of Service</a>
            </div>
          </div>
        </div>
        <div class="copyright">© ${new Date().getFullYear()} GAIN Creations. All rights reserved.</div>
      </div>
    </footer>`;
}

function layout({ title, description, active, body, canonical }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta name="theme-color" content="#092b4b">
  <link rel="canonical" href="${siteUrl}${canonical}">
  <link rel="icon" href="/assets/moneylit-icon.png">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${siteUrl}${canonical}">
  <meta property="og:image" content="${siteUrl}/assets/moneylit-icon.png">
  <link rel="stylesheet" href="/styles.css">
  <script defer src="/site.js"></script>
</head>
<body>
  ${nav(active)}
  <main id="main">${body}</main>
  ${footer()}
</body>
</html>`;
}

const featureCards = [
  ['💸', 'Finance tracking', 'Record income and expenses, organise accounts and credit cards, and understand your monthly balance.'],
  ['📊', 'Charts & smart insights', 'See category breakdowns, trends, budgets and helpful observations based on the records you enter.'],
  ['⏰', 'Useful reminders', 'Plan recurring bills, medicines, grocery expiry dates and everyday tasks.'],
  ['🤝', 'Split expenses', 'Keep clear records of shared costs with friends and groups without moving money through the app.'],
  ['🛒', 'Buy list', 'Create a searchable shopping list, add quantities and tick off items as you shop.'],
  ['🎨', 'Themes & colours', 'Personalise MoneyLit with themes, avatars, language choices and flexible home-screen settings.'],
  ['🔒', 'Privacy-minded design', 'Your finance records stay primarily on your device unless you choose an eligible cloud feature.'],
  ['📦', 'Backup & cloud sync', 'Premium adds protected backups and multi-device cloud sync for supported MoneyLit data.'],
  ['📱', 'SMS-assisted importing', 'On supported Android devices, turn selected bank messages into draft transactions for your review.'],
];

const homeBody = `
  <section class="container hero">
    <div>
      <span class="eyebrow">Your money, made clearer</span>
      <h1>Everyday finances in one <span>beautiful place.</span></h1>
      <p class="lead">Track money, understand spending, remember what matters, organise shopping and split expenses—all with MoneyLit.</p>
      <div class="actions">
        <a class="button" href="${playUrl}" target="_blank" rel="noopener">Download on Google Play ↗</a>
        <a class="button secondary" href="#features">Explore features</a>
      </div>
    </div>
    <div class="hero-visual" aria-label="MoneyLit app screenshots">
      <div class="phone primary"><img src="/assets/home.jpg" alt="MoneyLit home screen"></div>
      <div class="phone secondary"><img src="/assets/charts.jpg" alt="MoneyLit expense charts screen"></div>
      <div class="floating-card">✨ Track. Understand. Plan. One app for everyday money life.</div>
    </div>
  </section>

  <section class="section alt" id="features">
    <div class="container">
      <div class="section-heading">
        <span class="eyebrow">All-in-one organiser</span>
        <h2>More than an expense tracker</h2>
        <p>MoneyLit brings the small tools that shape everyday financial life into a simple, readable experience.</p>
      </div>
      <div class="grid">
        ${featureCards.map(([icon, title, text]) => `<article class="card"><div class="icon">${icon}</div><h3>${title}</h3><p>${text}</p></article>`).join('')}
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <article class="feature-story">
        <div class="story-visual"><img src="/assets/home.jpg" alt="MoneyLit home dashboard showing monthly finances"></div>
        <div class="story-copy">
          <span class="eyebrow">Know where you stand</span>
          <h2>Your financial month at a glance</h2>
          <p>MoneyLit gives you a clear picture of income, expenses and balance without requiring a complicated accounting setup. Keep cash, bank accounts, debit cards and credit-card activity organised in one place.</p>
          <ul class="check-list">
            <li>Record income, expenses and credit-card activity</li>
            <li>Create separate cash books for different parts of life</li>
            <li>Attach bills and organise transactions into categories</li>
            <li>Import supported bank SMS messages as drafts you approve</li>
          </ul>
        </div>
      </article>
      <article class="feature-story reverse">
        <div class="story-visual"><img src="/assets/charts.jpg" alt="MoneyLit charts and smart insights screen"></div>
        <div class="story-copy">
          <span class="eyebrow">Turn records into understanding</span>
          <h2>See patterns, not just numbers</h2>
          <p>Explore category breakdowns, calendar activity and monthly trends. Set category budgets and use Smart Insights to spot notable changes in the information you recorded.</p>
          <ul class="check-list">
            <li>Expense and income category breakdowns</li>
            <li>Month-to-month trends and calendar views</li>
            <li>Flexible monthly category budgets</li>
            <li>On-device Smart Insights with Premium access</li>
          </ul>
        </div>
      </article>
      <article class="feature-story">
        <div class="story-visual"><img src="/assets/reminders.jpg" alt="MoneyLit reminders for bills, medicines and groceries"></div>
        <div class="story-copy">
          <span class="eyebrow">Organise everyday life</span>
          <h2>Money tasks do not live in isolation</h2>
          <p>MoneyLit includes practical workspaces for the things surrounding your finances—from upcoming bills and medicines to shopping and shared costs.</p>
          <ul class="check-list">
            <li>Recurring bill, medicine and general reminders</li>
            <li>Grocery expiry reminders for supported items</li>
            <li>A searchable shopping list with quantities</li>
            <li>Equal, exact, percentage and share-based expense splitting</li>
          </ul>
        </div>
      </article>
    </div>
  </section>

  <section class="section alt">
    <div class="container trust-grid">
      <div class="trust-main">
        <span class="pill">Privacy-minded</span>
        <h2>Your records deserve thoughtful handling.</h2>
        <p>MoneyLit is designed to keep Free finance records primarily on your device. It does not contact your bank, move your money or read Gmail. Eligible cloud features are clearly separated and available when you choose to use them.</p>
        <a class="button orange" href="/privacy-policy/">Read the Privacy Policy</a>
      </div>
      <div class="trust-points">
        <article class="card"><div class="icon">📵</div><h3>No bank connection</h3><p>Balances come from the starting figures and transactions you record—not direct access to a bank account.</p></article>
        <article class="card"><div class="icon">🔐</div><h3>Protected access</h3><p>Account controls, app locking and protected backup options help you manage access to your information.</p></article>
        <article class="card"><div class="icon">🧭</div><h3>You stay in control</h3><p>Review imported drafts, manage permissions, export eligible records and request deletion from App Settings.</p></article>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="section-heading">
        <span class="eyebrow">Made to be explored</span>
        <h2>A quick look inside MoneyLit</h2>
        <p>Move naturally between finance, insights, reminders, shopping and shared expenses.</p>
      </div>
      <div class="showcase">
        <figure><img src="/assets/home.jpg" alt="MoneyLit finance dashboard" loading="lazy"><figcaption>Finance home</figcaption></figure>
        <figure><img src="/assets/charts.jpg" alt="MoneyLit charts and smart insights" loading="lazy"><figcaption>Smart insights</figcaption></figure>
        <figure><img src="/assets/reminders.jpg" alt="MoneyLit reminders workspace" loading="lazy"><figcaption>Reminders</figcaption></figure>
        <figure><img src="/assets/buy-list.jpg" alt="MoneyLit shopping list" loading="lazy"><figcaption>Buy list</figcaption></figure>
        <figure><img src="/assets/split.jpg" alt="MoneyLit split expense form" loading="lazy"><figcaption>Split expenses</figcaption></figure>
      </div>
    </div>
  </section>

  <section class="section alt">
    <div class="container">
      <div class="section-heading">
        <span class="eyebrow">Start in minutes</span>
        <h2>Three simple steps to a clearer view</h2>
        <p>MoneyLit works at your pace. Start small and add more tools when they become useful.</p>
      </div>
      <div class="steps">
        <article class="step"><h3>Install and explore</h3><p>Download MoneyLit from Google Play, choose your preferences and take the guided tour.</p></article>
        <article class="step"><h3>Add your first records</h3><p>Create an account, enter a transaction or review supported SMS import suggestions.</p></article>
        <article class="step"><h3>Build your routine</h3><p>Review charts, add budgets and reminders, organise shopping or share an expense.</p></article>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container premium">
      <div>
        <span class="pill">MoneyLit Premium</span>
        <h2>Keep your records available when you need them.</h2>
        <p>Unlock every feature, remove ads and add cloud-powered continuity.</p>
        <a class="button orange" href="${playUrl}" target="_blank" rel="noopener">View MoneyLit on Google Play</a>
      </div>
      <div>
        <h3>Premium highlights</h3>
        <ul class="check-list">
          <li>Multi-device cloud sync for supported records</li>
          <li>Password-protected backup and restore</li>
          <li>Smart insights, themes and personalisation</li>
          <li>An ad-free MoneyLit experience</li>
        </ul>
      </div>
    </div>
  </section>

  <section class="section alt">
    <div class="container">
      <div class="section-heading">
        <span class="eyebrow">Choose what fits</span>
        <h2>Useful for Free. More continuity with Premium.</h2>
        <p>You can begin with everyday tracking and upgrade when you want the complete experience.</p>
      </div>
      <div class="comparison">
        <article class="plan-card">
          <span class="plan-label">MoneyLit Free</span>
          <h3>Start organising today</h3>
          <ul class="check-list">
            <li>Core finance tracking and accounts</li>
            <li>Budgets, charts and calendar views</li>
            <li>Reminders and shopping tools</li>
            <li>Optional advertisements</li>
          </ul>
        </article>
        <article class="plan-card featured">
          <span class="plan-label">MoneyLit Premium</span>
          <h3>Unlock the full experience</h3>
          <ul class="check-list">
            <li>Supported multi-device cloud sync</li>
            <li>Password-protected backup and restore</li>
            <li>Smart Insights and full personalisation</li>
            <li>No advertisements</li>
          </ul>
        </article>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="section-heading">
        <span class="eyebrow">Common questions</span>
        <h2>Before you get started</h2>
      </div>
      <div class="faq-list">
        <details><summary>Does MoneyLit connect directly to my bank?</summary><p>No. MoneyLit does not log in to your bank or retrieve your balance. It organises records you enter or SMS import drafts that you review and approve.</p></details>
        <details><summary>Can I use MoneyLit without Premium?</summary><p>Yes. MoneyLit Free includes everyday finance organisation and may show advertisements. The exact available features are shown in the App.</p></details>
        <details><summary>What does Premium add?</summary><p>Premium unlocks all currently offered features, removes advertisements, and provides eligible cloud sync and protected backup functionality.</p></details>
        <details><summary>Does MoneyLit move or send money?</summary><p>No. MoneyLit is an organiser, not a bank or payment service. Split expenses are records of who owes what; settlement happens outside the App.</p></details>
        <details><summary>Can I delete my account and data?</summary><p>Yes. MoneyLit provides account and data controls in App Settings. Our <a href="/account-deletion/">Account Deletion page</a> explains the process.</p></details>
        <details><summary>Where can I get support?</summary><p>Use the Feedback option inside MoneyLit or visit our <a href="/contact/">Contact page</a> to prepare an email to GAIN Creations.</p></details>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container final-cta">
      <span class="eyebrow">Ready when you are</span>
      <h2>Give your everyday finances a clearer home.</h2>
      <p>Track what matters, understand your patterns and keep life’s money-related tasks together with MoneyLit.</p>
      <div class="actions">
        <a class="button" href="${playUrl}" target="_blank" rel="noopener">Get MoneyLit on Google Play ↗</a>
        <a class="button secondary" href="/about/">Learn about GAIN Creations</a>
      </div>
    </div>
  </section>`;

const aboutBody = `
  <header class="container page-hero">
    <span class="eyebrow">About MoneyLit</span>
    <h1>Practical tools for everyday financial clarity.</h1>
    <p class="lead">MoneyLit is designed to help people organise their own records without turning personal finance into a complicated accounting exercise.</p>
  </header>
  <section class="container section">
    <div class="grid">
      <article class="card"><div class="icon">💡</div><h3>Why we built it</h3><p>Everyday finances often live across notes, messages, reminders and spreadsheets. MoneyLit brings those tasks together in one readable app.</p></article>
      <article class="card"><div class="icon">🧭</div><h3>Our approach</h3><p>Clear monthly summaries, understandable balances, optional automation and controls that leave the user in charge.</p></article>
      <article class="card"><div class="icon">🛡️</div><h3>What it is not</h3><p>MoneyLit is not a bank, payment service or financial adviser. It organises information you provide and never moves your money.</p></article>
    </div>
  </section>
  <section class="section alt">
    <div class="container premium">
      <div><span class="pill">The publisher</span><h2>GAIN Creations</h2></div>
      <div><h3>Gajula Alliance for Innovation &amp; NextGen Creations</h3><p>GAIN Creations builds approachable digital products that combine practical utility, thoughtful design and responsible technology.</p><p>Questions? <a href="mailto:${supportEmail}">${supportEmail}</a></p></div>
    </div>
  </section>`;

const privacySections = [
  ['1. Overview', 'This Privacy Policy explains how MoneyLit (“the App”) and this website handle information. MoneyLit is published by GAIN Creations.'],
  ['2. Information you provide', 'Depending on how you use MoneyLit, this may include account details such as email and display name; finance records you enter; reminders, shopping lists and notes; optional bill or receipt images; and app preferences. If you contact us through this website, the name, email address, optional phone number, subject and message you choose to send are included in the email created by your device.'],
  ['3. Device permissions', 'On Android, if you allow SMS access, MoneyLit reads bank and card messages already on the phone to suggest transactions and credit-card bills. Raw message text is processed on the device and is not uploaded as an SMS archive. If you attach a bill or receipt image, the App uses the camera or photo library. Google sign-in uses your Google account email and basic profile; MoneyLit does not request access to Gmail or read your inbox.'],
  ['4. Information collected automatically', 'The App and its service providers may process technical information needed to operate and secure the service, such as app version, device type, diagnostic signals and session identifiers. Advertising partners may process device or usage signals when ads are displayed to Free users, subject to their own policies.'],
  ['5. Where data is stored', 'Free use stores finance data primarily on your device. If you enable an eligible Premium cloud feature, supported records are copied to cloud infrastructure so that features such as sync can work. Exported backup files remain wherever you choose to save them. Website feedback is sent using your chosen email application and is then handled by your email provider and ours.'],
  ['6. How information is used', 'We use information to provide and improve MoneyLit, authenticate and protect accounts, provide sync or backup features, manage feature access, display ads where applicable, and respond to support or feedback. We do not sell your personal finance records.'],
  ['7. Sharing and service providers', 'Information may be processed by providers that support authentication, hosting, storage, diagnostics, payments or advertising, only as needed for those services. We may disclose information when required by law or to protect rights, safety and security. We do not sell transaction histories to data brokers.'],
  ['8. Retention', 'Local data remains on your device until you delete it, clear app data or uninstall, subject to the operating system. Eligible cloud records are retained according to the cloud and subscription rules shown in the App. Feedback emails remain in the relevant mailboxes until deleted under normal email-retention practices. Exported backups remain wherever you saved them.'],
  ['9. Security', 'We use reasonable technical and organisational safeguards. No storage or transmission method is completely secure. Protect your device lock screen, email account and MoneyLit login credentials.'],
  ['10. Children', 'MoneyLit is a personal finance organiser intended for adults. You must be at least 18 years old to create an account or use the App. We do not knowingly collect personal information from anyone under 18.'],
  ['11. Your choices and rights', 'You may edit supported profile information, change permissions and preferences, export or delete data using available tools, request account deletion, or uninstall the App. You may contact us to ask about personal information associated with a support request.'],
  ['12. International processing', 'Service providers may process information in India or other countries where they operate. Data-protection rules can differ between countries.'],
  ['13. Changes', 'We may update this policy as MoneyLit and its services change. The updated date on this page will identify the current version.'],
  ['14. Contact', `For privacy questions, support or deletion assistance, email <a href="mailto:${supportEmail}">${supportEmail}</a>.`],
];

function legalBody(kicker, title, intro, sections) {
  return `
    <header class="container page-hero">
      <span class="eyebrow">${kicker}</span>
      <h1>${title}</h1>
      <p class="lead">${intro}</p>
    </header>
    <article class="prose">
      <p class="updated">Last updated: 23 November 2026</p>
      ${sections.map(([heading, body]) => `<section><h2>${heading}</h2>${body.split('\n\n').map((paragraph) => `<p>${paragraph}</p>`).join('')}</section>`).join('')}
    </article>`;
}

const termsSections = [
  ['1. Acceptance', 'By installing, accessing or using MoneyLit, you agree to these Terms of Service. If you do not agree, do not use the App.'],
  ['2. What MoneyLit provides', 'MoneyLit is a personal finance organiser that can help you record income and expenses, organise accounts and credit cards, import supported bank messages, set budgets, view charts, use reminders and shopping lists, and keep records of split expenses. The App is not a bank, payment service, investment platform, tax service or professional accounting product. It does not move money or provide regulated financial advice.'],
  ['3. Eligibility and accounts', 'MoneyLit is intended for adults. You must be at least 18 years old to create an account or use the App. Keep your credentials confidential, provide accurate account information and notify us if you believe your account is compromised.'],
  ['4. Your records and responsibility', 'You retain ownership of information you enter. You are responsible for its accuracy and for decisions you make using it. MoneyLit does not verify your income, expenses, balances, bills, reminders or shared-expense records.'],
  ['5. Free, rewards and Premium', 'Free use may show advertisements and leave some features limited. Diamonds are in-app rewards with no cash value and cannot be sold, transferred or exchanged for money. Premium features, prices, billing periods and availability are shown in the App and may change for future purchases. Purchases are processed using the billing method presented in MoneyLit, including Google Play where applicable.'],
  ['6. Subscriptions and cancellation', 'Subscription billing, renewal and cancellation are governed by the purchase terms shown at checkout and by the relevant app-store rules. Cancelling stops future renewal but generally does not end access already paid for. Refund eligibility is determined by applicable law and the payment platform’s policies.'],
  ['7. Cloud sync and backups', 'Eligible cloud sync and backup features require a signed-in account and may require Premium. Sync can be delayed or incomplete. Keep an independent backup of important records and protect exported backup files and passwords.'],
  ['8. Reminders and alarms', 'Reminders are convenience tools. Delivery depends on permissions, device settings, battery state and operating-system limits. Do not rely on MoneyLit for emergency, medical or other critical alerts.'],
  ['9. Shared expenses', 'Split features maintain records only and do not transfer funds. Participants are responsible for checking amounts and settling directly. Shared records required to preserve another participant’s balances may remain after an account is closed.'],
  ['10. Acceptable use', 'Do not misuse MoneyLit or related services, interfere with security, attempt unauthorised access, automate abusive activity, manipulate rewards, overload services, or use the App for unlawful purposes.'],
  ['11. Intellectual property', 'MoneyLit’s name, branding, design, documentation, software and proprietary assets belong to GAIN Creations and its licensors. You receive a limited, personal, non-exclusive and non-transferable licence to use the App. You may not copy, republish, sell, reverse engineer or create derivative products except where applicable law expressly permits it.'],
  ['12. Third-party services and advertisements', 'MoneyLit may use third-party authentication, hosting, payment, analytics and advertising services. Their own terms and privacy policies apply to their services and content.'],
  ['13. Disclaimer', 'MoneyLit is provided “as is” and “as available.” To the extent permitted by law, we do not guarantee uninterrupted operation, complete accuracy, successful sync or fitness for a particular purpose. Nothing in MoneyLit is financial, legal, accounting, investment or tax advice.'],
  ['14. Limitation of liability', 'To the fullest extent permitted by law, GAIN Creations is not liable for lost records, missed reminders, sync failures, third-party outages or decisions based on information in the App. Where liability cannot be excluded, total liability is limited to the amount paid for MoneyLit Premium in the twelve months before the claim.'],
  ['15. Termination and deletion', 'You may stop using MoneyLit and request account deletion at any time. We may restrict or terminate access for a serious breach, abuse, security risk or legal requirement. See the Account Deletion page for the current process.'],
  ['16. Changes and governing law', 'We may update these Terms. Continued use after an update means you accept the revised Terms. These Terms are governed by the laws of India, subject to mandatory consumer protections that apply to you.'],
  ['17. Contact', `Questions about these Terms may be sent to <a href="mailto:${supportEmail}">${supportEmail}</a>.`],
];

const deletionBody = `
  <header class="container page-hero">
    <span class="eyebrow">Account &amp; data</span>
    <h1>Delete your MoneyLit account</h1>
    <p class="lead">The fastest and safest method is available directly inside MoneyLit.</p>
  </header>
  <article class="prose">
    <p class="updated">Last updated: 23 November 2026</p>
    <section>
      <h2>Before you delete</h2>
      <p>Account deletion is permanent. If you may need your records later, create an eligible backup before continuing. Deleting an account does not automatically cancel a Google Play subscription; cancel it separately in Google Play to prevent future renewal.</p>
    </section>
    <div class="deletion-step"><h2>1. Open MoneyLit</h2><p>Sign in to the account you want to delete.</p></div>
    <div class="deletion-step"><h2>2. Open App Settings</h2><p>Go to your profile or App Settings and select <strong>Delete account</strong>.</p></div>
    <div class="deletion-step"><h2>3. Choose a reason</h2><p>Select the reason that best describes why you are leaving. An optional note can help us improve.</p></div>
    <div class="deletion-step"><h2>4. Confirm deletion</h2><p>After confirmation, the account is disabled immediately, you are signed out and MoneyLit data held by the App on that phone is erased. The deletion request is then processed for backend account and cloud-data removal.</p></div>
    <section>
      <h2>What may remain</h2>
      <p>Expenses shared through Split may remain visible to the friends or groups involved so their balances stay consistent. Limited records may also be retained where required for security, fraud prevention, legal obligations or transaction records. An anonymised deletion reason may be retained as a statistic.</p>
    </section>
    <section>
      <h2>Cannot access the App?</h2>
      <p>Email <a href="mailto:${supportEmail}?subject=MoneyLit%20account%20deletion%20request">${supportEmail}</a> from the address used for your MoneyLit account. Use the subject “MoneyLit account deletion request.” We may ask you to verify account ownership before acting.</p>
    </section>
  </article>`;

const contactBody = `
  <header class="container page-hero">
    <span class="eyebrow">Contact GAIN Creations</span>
    <h1>Send us your feedback</h1>
    <p class="lead">Questions, ideas or support requests are welcome. The form opens your email application with the details prefilled.</p>
  </header>
  <section class="container contact-layout">
    <aside class="contact-panel">
      <h2>MoneyLit support</h2>
      <p>We aim to make everyday finance tracking easier to understand and use.</p>
      <p><strong>Email</strong><br><a href="mailto:${supportEmail}">${supportEmail}</a></p>
      <p><strong>Publisher</strong><br>GAIN Creations<br><small>Gajula Alliance for Innovation &amp; NextGen Creations</small></p>
    </aside>
    <form class="contact-form" data-contact-form>
      <h2>Send an enquiry</h2>
      <div class="notice">Please do not include passwords, payment credentials, full bank details, transaction records or other sensitive financial information.</div>
      <div class="field-grid">
        <div><label for="name">Full name <span class="required">*</span></label><input id="name" name="name" autocomplete="name" required placeholder="Your name"></div>
        <div><label for="email">Email <span class="required">*</span></label><input id="email" name="email" type="email" autocomplete="email" required placeholder="your@email.com"></div>
      </div>
      <label for="phone">Phone number <span class="form-help">(optional)</span></label>
      <input id="phone" name="phone" type="tel" autocomplete="tel" placeholder="+91 XXXXX XXXXX">
      <label for="subject">Subject <span class="required">*</span></label>
      <select id="subject" name="subject" required>
        <option value="">Choose a topic</option>
        <option>App support</option>
        <option>Feature suggestion</option>
        <option>Premium or purchase question</option>
        <option>Privacy or account deletion</option>
        <option>General feedback</option>
      </select>
      <label for="message">Message <span class="required">*</span></label>
      <textarea id="message" name="message" required minlength="10" placeholder="How can we help you?"></textarea>
      <p class="form-help">Submitting will open your default email app. Review the message there and press Send to deliver it.</p>
      <button class="button orange" type="submit">Prepare email</button>
    </form>
  </section>`;

const pages = [
  ['index.html', layout({ title: 'MoneyLit — Everyday Finance, Made Clear', description: 'Track finances, understand spending, set reminders, organise shopping and split expenses with MoneyLit.', active: 'home', canonical: '/', body: homeBody })],
  ['about/index.html', layout({ title: 'About MoneyLit | GAIN Creations', description: 'Learn why GAIN Creations built MoneyLit and how it helps organise everyday personal finances.', active: 'about', canonical: routes.about, body: aboutBody })],
  ['privacy-policy/index.html', layout({ title: 'MoneyLit Privacy Policy', description: 'Read how MoneyLit and GAIN Creations handle app, account and website information.', active: 'privacy', canonical: routes.privacy, body: legalBody('Privacy & data', 'Privacy Policy', 'How MoneyLit handles information when you use the App, cloud features or this website.', privacySections) })],
  ['terms-of-service/index.html', layout({ title: 'MoneyLit Terms of Service', description: 'Terms governing the use of MoneyLit, its free and Premium features, cloud services and rewards.', active: 'terms', canonical: routes.terms, body: legalBody('Terms & conditions', 'Terms of Service', 'The rules and responsibilities that apply when you use MoneyLit.', termsSections) })],
  ['account-deletion/index.html', layout({ title: 'Delete Your MoneyLit Account', description: 'Follow these steps to request deletion of your MoneyLit account and associated cloud data.', active: 'deletion', canonical: routes.deletion, body: deletionBody })],
  ['contact/index.html', layout({ title: 'Contact MoneyLit | GAIN Creations', description: 'Contact GAIN Creations for MoneyLit support, questions, ideas and feedback.', active: 'contact', canonical: routes.contact, body: contactBody })],
];

for (const [relativePath, content] of pages) {
  const target = path.join(dist, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}

await writeFile(
  path.join(dist, 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
);

await writeFile(
  path.join(dist, 'app-ads.txt'),
  'google.com, pub-1528542694078448, DIRECT, f08c47fec0942fa0\n',
);

await writeFile(
  path.join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${Object.values(routes).map((route) => `  <url><loc>${siteUrl}${route === '/' ? '/' : route}</loc></url>`).join('\n')}
</urlset>
`,
);

const css = await readFile(path.join(dist, 'styles.css'), 'utf8');
if (!css.includes(':root')) throw new Error('Stylesheet was not copied correctly');

console.log(`Built ${pages.length} pages in ${dist}`);
