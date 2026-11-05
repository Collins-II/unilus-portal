import Link from "next/link";
import BrandLogo from "@/components/brand-logo";

export const metadata = { title: "Initial administrator setup" };

export default function SetupPage() {
  return <main className="login-page">
    <section className="login-card campus-setup-card">
      <div className="login-brand"><BrandLogo /></div>
      <h1>Initial administrator setup</h1>
      <p>The first administrator is created through staff sign-in using server-configured credentials. There is no public administrator registration form.</p>
      <ol className="campus-setup-steps">
        <li><strong>Configure the shared database and authentication.</strong><p>Set <code>MONGODB_URL</code> to the same database as the student app, and configure a distinct <code>NEXTAUTH_SECRET</code> for this portal.</p></li>
        <li><strong>Set the initial administrator credentials on the server.</strong><p>Configure <code>ADMIN_EMAIL</code>, a strong <code>ADMIN_PASSWORD</code> of at least 10 characters, and optionally <code>ADMIN_NAME</code>. Never enter these values into source code or share them publicly.</p></li>
        <li><strong>Restart the portal and sign in.</strong><p>Use that email and password on the staff sign-in page. The administrator is created only if no staff accounts already exist.</p></li>
        <li><strong>Remove the bootstrap password after the first sign-in.</strong><p>Remove <code>ADMIN_PASSWORD</code> from the server environment and restart. The saved staff account remains available; changing these bootstrap variables never resets an existing account.</p></li>
      </ol>
      <p className="login-help">If staff accounts already exist, use your assigned account or contact the system administrator. Students continue to sign in through UNILUS Navigator.</p>
      <Link className="primary-button" href="/login">Go to staff sign in</Link>
    </section>
  </main>;
}
