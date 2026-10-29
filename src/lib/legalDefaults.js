/**
 * Placeholder text for the legal pages, shown until an admin saves real
 * content from /admin/legal. It's also what the editor starts with.
 *
 * Uses the formatting described in markdown.js.
 */

export const DEFAULT_LAST_UPDATED = '2026-10-29';

const privacy = `This Privacy Policy explains what information QR Go (“we”, “us”) collects when you use our dynamic QR code service, how we use it, and the choices you have. By using QR Go you agree to the practices described here.

## 1. Information we collect

We collect the following types of information:

- **Account details** — your name, email address and password. Passwords are stored as a secure hash and are never visible to us.
- **QR code content** — the names, destination links, collections and design settings of the QR codes you create.
- **Scan data** — when someone scans one of your codes we record the time of the scan, an approximate location (country and city), the device type, operating system, browser and preferred language.

We do not store the IP address of people who scan your codes. It is used briefly to estimate location and to create an anonymous identifier for counting unique scans, then discarded.

## 2. How we use your information

- To create, host and redirect your dynamic QR codes.
- To show you analytics about how your codes are being scanned.
- To manage your account, plan and security.
- To contact you about important changes to the service.
- To detect and prevent abuse, fraud and misuse of the service.

## 3. Cookies

We use a single essential cookie to keep you signed in. It lasts for seven days and is removed when you sign out. We do not use advertising or third-party tracking cookies.

## 4. Sharing your information

We do not sell your personal information. We only share it with service providers who help us run QR Go (such as hosting providers), under agreements that require them to protect it, or when we are required to by law.

## 5. How long we keep it

Detailed scan records are kept for 24 months and then deleted; the total scan count for each code is kept. Account details and QR codes are kept for as long as your account is open. When you close your account we delete your data within a reasonable period, unless we need to keep some of it to meet legal obligations.

## 6. Security

We use industry-standard measures to protect your information, including encrypted connections and hashed passwords. No system is perfectly secure, so we cannot guarantee absolute security.

## 7. Your rights

Depending on where you live, you may have the right to access, correct, export or delete your personal information, and to object to how we use it. You can update most of your details from your account settings, or contact us to make a request.

## 8. Children

QR Go is not intended for children under 16, and we do not knowingly collect information from them.

## 9. Changes to this policy

We may update this policy from time to time. If we make significant changes we will let you know by email or through the service. The date at the top of this page shows when it was last updated.

## 10. Contact us

If you have questions about this policy or your information, email us at [privacy@example.com](mailto:privacy@example.com). See also our [Terms & Conditions](/terms).`;

const terms = `These Terms & Conditions (“Terms”) govern your use of QR Go (“we”, “us”), including our website, dashboard and dynamic QR code service. Please read them carefully before using the service.

## 1. Acceptance of these terms

By creating an account or using QR Go, you agree to these Terms and to our [Privacy Policy](/privacy). If you do not agree, please do not use the service.

## 2. The service

QR Go lets you create dynamic QR codes whose destinations can be changed after they are printed, and view analytics about how they are scanned. Features and usage limits depend on the plan assigned to your account.

## 3. Your account

- You must give accurate information when you sign up.
- You are responsible for keeping your password safe and for all activity on your account.
- Tell us straight away if you think someone has accessed your account without permission.

## 4. Acceptable use

You agree not to use QR Go to link to or distribute:

- Phishing, scams, malware or other harmful content.
- Anything illegal, or that infringes someone else’s rights.
- Spam, or content that is abusive, hateful or misleading.

You also agree not to interfere with the service, try to access it in unauthorised ways, or use it to overload our systems.

## 5. Your content

You keep ownership of the content you add to QR Go, such as code names and destination links. You give us permission to store and process it only as needed to provide the service. You are responsible for making sure your destinations are lawful and that you have the right to use them.

## 6. Availability of your codes

Dynamic QR codes rely on our service to redirect each scan. If the service is unavailable, or your account is suspended or closed, your codes will stop redirecting to their destinations. We aim to keep QR Go running reliably but do not guarantee uninterrupted access.

## 7. Suspension and termination

We may suspend or close your account if you break these Terms or if your use of the service puts others at risk. You can stop using QR Go at any time.

## 8. Disclaimers

QR Go is provided “as is” and “as available”. To the extent allowed by law, we make no warranties of any kind, whether express or implied, about the service.

## 9. Limitation of liability

To the extent allowed by law, we are not liable for any indirect, incidental or consequential loss arising from your use of QR Go, including lost profits, lost data or the cost of reprinting materials.

## 10. Changes to these terms

We may update these Terms from time to time. If we make significant changes we will let you know by email or through the service. Continuing to use QR Go after changes take effect means you accept the updated Terms.

## 11. Governing law

These Terms are governed by the laws of [Jurisdiction], and any disputes will be handled by the courts of that jurisdiction.

## 12. Contact us

If you have questions about these Terms, email us at [legal@example.com](mailto:legal@example.com).`;

export const DEFAULT_LEGAL_CONTENT = { privacy, terms };
