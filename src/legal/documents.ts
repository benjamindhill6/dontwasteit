// The User Agreement and Privacy Policy, shown in the app and agreed to on first use.
//
// To publish a new version: update the text, change `version` (use the document's date), and
// deploy. Everyone is asked to agree again the next time they open the app, because acceptances
// are stored per version in the `agreements` table.

/** A run of text with an optional bold lead-in, like "Your account." followed by the rest. */
export type Span = { b?: string; t?: string }
export type Block =
  | { kind: 'h'; text: string }
  | { kind: 'p'; span: Span }
  | { kind: 'ul'; items: Span[] }

export type LegalDoc = {
  id: 'terms' | 'privacy'
  title: string
  short: string
  path: string
  version: string
  date: string
  blocks: Block[]
}

const h = (text: string): Block => ({ kind: 'h', text })
const p = (t: string, b?: string): Block => ({ kind: 'p', span: { b, t } })
const ul = (...items: (string | [string, string])[]): Block => ({
  kind: 'ul',
  items: items.map((i) => (typeof i === 'string' ? { t: i } : { b: i[0], t: i[1] })),
})

export const TERMS: LegalDoc = {
  id: 'terms',
  title: "Don't Waste It! User Agreement",
  short: 'User Agreement',
  path: '/profile/terms',
  version: '2026-11-17',
  date: 'November 17, 2026',
  blocks: [
    h('The short version'),
    p('This agreement is between you and Braxton Executive Services LLC ("we" or "us") and covers your use of Don\'t Waste It! (the "app"). By accepting an invitation, signing in or using the app, you agree to it. If you are using the app for a pantry or business, you confirm you have the authority to do that on its behalf.'),
    p('The app is free. It helps pantries, restaurants and stores share surplus food. It does not move, inspect or guarantee any food, and we are not responsible for what happens in an exchange or for problems with the app itself. Please enter only names, email addresses and phone numbers, and only for the purpose of sharing food.'),
    p('Our Privacy Policy is part of this agreement. If the two ever conflict, this agreement controls.'),

    h('What the app is and who can use it'),
    p('The app is invite-only. An admin adds every pantry, business and person, and nobody can sign up on their own. Approved pantries can post surplus food and needs, claim food, and schedule exchanges. Approved restaurants and stores can post surplus food but cannot claim food or post needs.'),
    p('You must be 18 or older to use the app. We decide who is approved, and we can decline or remove anyone at any time. The app is a free tool for connecting organizations. It is not a food bank, a distributor, a carrier or a broker, and we are not a party to any exchange between users.'),
    p('We may change, pause or shut down the app, or any part of it, at any time, with or without notice.'),

    h('Accounts and contacts'),
    p('Each person has their own login. Keep your sign-in details to yourself, and tell us right away if you think someone else has used your account. You are responsible for what happens under your login.'),
    p("In Phase 1, every pantry contact is an admin of their own pantry. That means any contact can edit the pantry's profile and schedule and can add or remove other contacts at that pantry. If you add someone, you are responsible for making sure they are a real volunteer or staff member who should have access, and that they follow this agreement. Deactivate contacts who leave your organization. Deactivating a contact removes their login and stops their notifications right away."),
    p('Contact names and phone numbers are visible to every approved pantry at all times. By using the app, you agree that yours can be seen that way, and you confirm that any contact you add has agreed to it too.'),
    p('Keep your information accurate and up to date. We may deactivate any account or organization at any time.'),

    h('What you may and may not put in the app'),
    p("Put in only what the app needs: your name, email address and phone number, your organization's details, and information and photos about the food you are sharing. Use them only for the purpose of sharing food."),
    p('Never put private or sensitive information in the app. That includes anything about the people your pantry serves, government ID or financial account numbers, passwords, and photos of people or documents. The app is not built to protect sensitive data and stores none on purpose. If you enter it anyway, you do so at your own risk, and we may delete it without notice.'),
    p('You are responsible for everything you post. You give us permission to store your content and show it to other approved users, but only as needed to run the app. You keep ownership of it. We may remove any content at any time.'),

    h('Posts, claims and exchanges'),
    p('Exchanges happen directly between users. We do not take part in them, supervise them or check them.'),
    ul(
      ['Be accurate.', ' Describe food honestly, including quantities, categories and best-by dates. Mark food as coming from Philabundance or SHARE only if it truly does and your pantry is a client of that provider. Follow the rules of any agreement you have with those providers.'],
      ['Be reliable.', ' A claim holds the food for one pantry. If you cannot complete a pickup or delivery, release the claim promptly so others can take it.'],
      ['Arrange the handoff yourselves.', ' The app helps you agree on a time. Users handle pickup, delivery, transport and any follow-up on their own, and are responsible for their own drivers, vehicles and volunteers.'],
      ['Completing an exchange.', ' Either pantry marking an exchange complete closes it. We do not decide disputes between users, and the app is not proof of what was agreed or delivered.'],
    ),
    p('We do not promise that any post will be claimed, that any food will be available, or that any other user will show up or behave well.'),

    h('Food safety and the law'),
    p('You are responsible for the safety of any food you post, claim, move or give away. That includes storage, temperature control, labeling, allergen information, recalls and handling during transport. We do not inspect, test or verify any food, and a photo or description in the app is not a guarantee of quality or safety.'),
    p('Do not post food that is spoiled, recalled, past its safe date or otherwise unsafe, and do not claim food you cannot handle safely. Follow all laws and rules that apply to you, including food safety and health department rules, any licenses you hold, and your agreements with food providers such as Philabundance or SHARE.'),
    p('Federal and state food donation laws may protect people and organizations that donate food in good faith. Nothing in this agreement limits those protections. We make no promise about whether they apply to you.'),

    h('Acceptable use'),
    p('Use the app only to share food. Do not:'),
    ul(
      "Use anyone's name, phone number or email for anything other than arranging food exchanges. No marketing, solicitations, fundraising appeals, or lists for other purposes.",
      'Sell food you receive through the app, or use the app to resell food for profit.',
      'Harass, threaten or discriminate against other users, or post anything unlawful or misleading.',
      'Try to get into accounts or data you are not allowed to see, interfere with the app, or copy its data in bulk.',
      'Share your login, or let someone use the app who has not been approved.',
    ),
    p('We may remove content, suspend accounts or deactivate organizations that break these rules, or for any other reason.'),

    h('The app is free and comes as is'),
    p('The app is free, and we provide it "as is" and "as available," without promises or warranties of any kind, whether express or implied. We do not promise that the app will work, be secure, be available at any given time, or be free of errors.'),
    p('That includes problems with the technology. Things can go wrong: the app may be down, slow or wrong, alerts may be late or never arrive, a post or claim may not show up as it should, distances may be off, information may be lost, and our hosting and database providers may pause, change or fail. The app runs on free plans, and we do not promise backups or recovery of any data.'),
    p('Do not depend on the app for anything urgent or safety-related. Keep your own records and have your own way to reach the people you work with.'),

    h('We are not liable'),
    p('To the fullest extent the law allows, we are not liable for any claim, loss, injury, illness or damage connected to the app or to any exchange arranged through it. That includes:'),
    ul(
      'Food that is unsafe, mislabeled, spoiled or contaminated, and any illness or injury it causes',
      'Injury or property damage during pickup, delivery or transport',
      'Food or opportunities lost, missed or delayed exchanges, and wrong or late information',
      'Technology problems of any kind, including outages, bugs, lost data, failed alerts and security incidents',
      'What other users, providers or third parties say or do',
    ),
    p('This covers direct and indirect losses of any kind. It applies to us and to anyone who helps run the app, including volunteers, owners, officers and agents. Because the app is free, if a court finds that we are liable anyway, our total liability is limited to the amount you paid us to use the app, which is $0.'),
    p('You release us from all claims of this kind. Nothing in this agreement limits liability that the law does not allow to be limited.'),

    h('Your responsibility, and ending your use'),
    p('You agree to defend us against, and cover any loss from, claims that arise from your use of the app, your posts, your exchanges with other users, or your breach of this agreement. If you use the app for a pantry or business, this applies to that organization too.'),
    p("We may suspend or end any account or organization at any time, with or without notice. You may stop using the app at any time. To have your account deactivated, contact us or ask your organization's admin. Sections about liability, responsibility and legal terms continue to apply after you stop."),

    h('Legal terms and contact'),
    p('This agreement is governed by Pennsylvania law. Any dispute will be handled in the state or federal courts that serve Delaware County, Pennsylvania, and you agree to those courts.'),
    p('We may update this agreement. We will change the date at the top and tell users in the app before a material change takes effect. Using the app afterward means you accept the update. If any part of this agreement is found unenforceable, the rest still applies. This agreement and the Privacy Policy are the whole agreement between you and us about the app.'),
    p('Questions: benjamindhill6@gmail.com.'),
  ],
}

export const PRIVACY: LegalDoc = {
  id: 'privacy',
  title: "Don't Waste It! Privacy Policy",
  short: 'Privacy Policy',
  path: '/profile/privacy',
  version: '2026-11-17',
  date: 'November 17, 2026',
  blocks: [
    h('The short version'),
    p('Don\'t Waste It! is a free, invite-only web app where food pantries, restaurants and stores share surplus food. This policy explains what information the app holds and what we do with it. The app is operated by Braxton Executive Services LLC ("we" or "us").'),
    p('We collect only what the app needs to move food between organizations: your name, email address and phone number, plus basic details about your pantry or business and the food you post. We never sell your information. We do not share it with anyone outside the app, other than the technology providers that run the app for us, which are listed below.'),
    p('Please do not put anything else personal into the app. The app is not built to protect sensitive information, so it should never hold any.'),

    h('What we collect'),
    p('We collect the following, and nothing more:'),
    ul(
      ['Your account.', ' Your name, email address and phone number. Your email is used to sign you in. An admin creates every account, so we hold only what an admin or someone at your organization entered for you.'],
      ['Your organization.', ' Pantry or business name, full street address, delivery and pickup distances, whether it is a Philabundance or SHARE client, and its serving schedule.'],
      ['What you post.', ' Food line items, categories, quantities, best-by dates, pickup and delivery windows, needs, and up to three photos per surplus post.'],
      ['Exchange activity.', ' Claims, proposed times, releases, edits and completions, including who did what and when.'],
      ['Your alert settings and device.', ' Your notification choices, and the device address your browser or phone gives us so we can send push alerts.'],
      ['Technical records.', ' Standard logs that our hosting and database providers keep when you use the app, such as IP address and browser type.'],
    ),
    p("We do not collect payment information, because the app is free. We do not use your phone's GPS location. We do not collect any information about the people your pantry serves. The app has no map, and an organization's address is used only to check distances between organizations."),

    h('What not to put in the app'),
    p('The only personal information that belongs in the app is your name, email address and phone number, and only so people can share food. Please do not enter anything else about yourself or anyone else. In particular, never put these in the app, including in post descriptions, item names, photos or any free-text field:'),
    ul(
      'Anything about the people your pantry serves, such as names, households, addresses, income, health, immigration status or other personal circumstances',
      'Government ID numbers, Social Security numbers, bank or card numbers, or passwords',
      'Photos of people, faces, license plates, mail, forms or documents',
      'Any other sensitive or private information',
    ),
    p('The app is built to be simple, free and invite-only. It is not built to protect sensitive data. If sensitive information is entered anyway, we may delete it without notice, and the person who entered it is responsible for it.'),

    h('How we use information'),
    p('We use your information only to run the app as a food-sharing tool:'),
    ul(
      'To sign you in and keep your account secure',
      'To show posts and needs to the right organizations, based on distance, provider priority and notification settings',
      'To send push alerts and to let people schedule and complete exchanges',
      'To let approved organizations contact each other about food',
      'To produce admin reports of completed exchanges',
      'To fix problems, keep the app running and contact you about the service',
    ),
    p('We do not use your information for advertising, marketing or sales of any kind. That includes marketing for any other business, service or project that the people running this app are involved in. We do not build profiles about you, and we do not use your information to train advertising or data products.'),

    h('Who can see your information'),
    p('We never sell, rent or trade your information, and we do not share it with anyone outside the app except in the limited cases listed below.'),
    p('', 'Inside the app'),
    ul(
      ['Other organizations.', " Every approved pantry can see the name and phone number of every contact, at all times, so people can text each other to arrange a handoff. The Text button opens your phone's messaging app with that number filled in. Your email address is not shown to other organizations. Only admins and the other contacts at your own organization can see it."],
      ['Posts and schedules.', " Surplus posts, needs and serving schedules are visible to approved organizations under the app's distance and provider-priority rules."],
      ['Admins.', ' Platform admins can see everything in the app and can run and download reports of completed exchanges.'],
    ),
    p('', 'Outside the app, only in these cases'),
    ul(
      ['Technology providers.', ' The companies that host and run the app handle your information only to provide their service to us. They are listed under Notifications, devices and providers.'],
      ['The law.', ' We may disclose information if a valid legal process requires it.'],
      ['A change of operator.', ' If the app moves to a nonprofit or another organization, your information moves with it and the promises in this policy move with it.'],
      ['Reports.', ' Admin reports show organizations, items and quantities for completed exchanges. If an admin shares a report, it will not include the names, phone numbers or email addresses of individual contacts.'],
    ),

    h('Photos and how long we keep things'),
    p('The app keeps information only as long as it is useful for sharing food.'),
    ul(
      ['Surplus posts and photos.', ' A surplus post lasts 7 days. When it expires, any unclaimed quantity expires and its photos are deleted. A claim that is already open stays active until it is completed or released.'],
      ['Needs.', ' A need stays open for 30 days, or until the poster removes it.'],
      ['Exchange records.', ' We keep a record of claims, edits, releases and completed exchanges so admins can run reports. These records can include the name of the person who acted. We keep them for as long as the network runs.'],
      ['Accounts.', ' An account lasts until it is deactivated. Deactivating a contact removes their login and stops their notifications immediately.'],
      ['Backups.', ' We keep a private weekly export of the data as a backup. Older exports are replaced on a rolling basis.'],
    ),
    p('You can ask us to delete your personal information at any time. We will delete it or remove your name from our records, except where we need to keep a record of a completed exchange for reports. Even then, we will replace your name with a generic label if you ask.'),

    h('Notifications, devices and providers'),
    p('If you turn on push alerts, your browser or phone gives the app an address for your device. We use it only to send you alerts. You can narrow or turn off alerts in the app, or in your device settings, at any time. A few alerts about your own claims and posts always come through.'),
    p("The app keeps you signed in using your browser's storage. It does not use advertising or tracking cookies."),
    p('A few outside companies handle information on our behalf, only to provide the service:'),
    ul(
      ['Supabase.', ' Stores the database, handles sign-in, and stores photos on servers in the United States.'],
      ['Cloudflare.', " Hosts and delivers the app's web pages."],
      ['Email delivery service.', ' Sends invitations and sign-in emails.'],
      ['Address lookup service.', ' Receives only the street address of a pantry or business, once, when an admin saves it, so the app can check distances.'],
      ['Push services run by Apple, Google and Mozilla.', ' Deliver alerts to your device.'],
    ),
    p('These companies have their own privacy practices. We do not allow any of them to use your information for their own advertising through our account.'),

    h('Security'),
    p('We keep security simple and sensible. Sign-in is by invitation only, every person has their own account, and admins control who is approved. Who can see a post or a report is enforced in the database, not only hidden on screen. Information travels over encrypted connections.'),
    p('No system is perfectly secure, and we cannot promise that yours will never be accessed without permission. The app is not built for sensitive data, which is why we ask you not to enter any. If we learn of a security problem that affects your information, we will tell the people affected.'),

    h('Your choices'),
    p('You can see and update your own name and phone number in the app. Contacts at your organization can add, edit and deactivate other contacts at the same organization. You can narrow your own alerts, and you can turn off push alerts in your device settings.'),
    p("To correct, download or delete your information, or to have your account deactivated, contact us at the address below or ask your organization's admin. We will respond promptly."),

    h('Children, changes and contact'),
    p('The app is for adults 18 and older. It is not meant for children, and we do not knowingly collect information from them. If we learn that we have, we will delete it.'),
    p('If we change this policy, we will update the date at the top and tell users in the app before any material change takes effect. Using the app after that means you accept the change.'),
    p('Questions or requests about your information: benjamindhill6@gmail.com.'),
  ],
}

export const LEGAL_DOCS = [TERMS, PRIVACY]
