import React from 'react';
import { Link } from 'react-router-dom';
import './UserGuidePage.css';

/** Set to true to show Free Operators in the special lists section */
const SHOW_FREE_OPERATORS = false;

const UserGuidePage: React.FC = () => {
  return (
    <div className="user-guide-page">
      <div className="user-guide-header">
        <Link to="/" className="back-button">← Back to Home</Link>
        <h1>Arknights Tier Lists & Team Builder — User Guide</h1>
        <p className="user-guide-intro">
          This guide explains how to use the website: browsing operator tier lists, synergies, building teams, and managing your operator collection.
        </p>
      </div>

      <div className="user-guide-content">
        <section className="guide-section">
          <h2>Getting started</h2>
          <h3>Creating an account</h3>
          <ol>
            <li>Click <strong>Register</strong> in the navigation bar.</li>
            <li>Enter your <strong>email</strong> and choose a <strong>password</strong> (at least 8 characters).</li>
            <li>Confirm your password and submit.</li>
            <li>You’ll be taken to your <strong>Profile</strong> page.</li>
          </ol>
          <p>You need an account to use the <strong>Team Builder</strong>, <strong>Integrated Strategies</strong>, and to track which operators you own.</p>

          <h3>Logging in</h3>
          <ul>
            <li>Use <strong>Login</strong> in the nav bar and enter your email and password.</li>
            <li>If you’re already logged in, the nav shows <strong>Team Builder</strong>, <strong>Integrated Strategies</strong>, and your <strong>nickname</strong> (or email) instead of Login/Register.</li>
          </ul>
        </section>

        <section className="guide-section">
          <h2>Navigation</h2>
          <p>The top bar includes:</p>
          <ul>
            <li><strong>Home</strong> — Overview and link to Team Builder or sign-up.</li>
            <li><strong>Tier Lists</strong> — All niche/tier lists (e.g. DPS, laneholders, healing).</li>
            <li><strong>Synergies</strong> — Operator synergies (e.g. burn, necrosis).</li>
            <li><strong>All Operators</strong> — Full operator roster with search and filters.</li>
            <li><strong>Team Builder</strong> / <strong>Integrated Strategies</strong> / <strong>Profile</strong> — Only when logged in.</li>
            <li><strong>Login</strong> / <strong>Register</strong> or <strong>Logout</strong> — Depending on auth state.</li>
          </ul>
          <p>The <strong>footer</strong> has a <strong>language selector</strong> (operator name language) and a <strong>Feedback</strong> link.</p>
        </section>

        <section className="guide-section">
          <h2>Quick reference</h2>
          <div className="guide-table-wrap">
            <table className="guide-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Where</th>
                  <th>Account needed?</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Tier / niche lists</td><td>Tier Lists → niche</td><td>No</td></tr>
                <tr><td>Synergies</td><td>Synergies → synergy</td><td>No</td></tr>
                <tr><td>All Operators</td><td>All Operators</td><td>No</td></tr>
                <tr><td>Operator detail</td><td>Click any operator</td><td>No</td></tr>
                <tr><td>Level badges (E2/M)</td><td>Niche / Synergy / Operator page toggles</td><td>No</td></tr>
                <tr><td>Profile (owned/want)</td><td>Profile</td><td>Yes</td></tr>
                <tr><td>Team Builder</td><td>Team Builder</td><td>Yes</td></tr>
                <tr><td>Integrated Strategies</td><td>Integrated Strategies</td><td>Yes</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="guide-section">
          <h2>Your profile (logged-in only)</h2>
          <ul>
            <li>Open <Link to="/profile">Profile</Link> from the nav (your nickname/email).</li>
            <li><strong>Owned operators</strong> — Add or remove operators you’ve raised. The Team Builders <strong>WILL ONLY</strong> use this list to build teams.</li>
            <li><strong>Want to use</strong> — Mark operators you prefer to use; the builders can favor these when suggesting teams.</li>
            <li>You can search and filter (rarity, class) when adding or viewing operators.</li>
          </ul>
        </section>

        <section className="guide-section">
          <h2>Team Builder (logged-in only)</h2>
          <ul>
            <li><Link to="/team-builder">Team Builder</Link> builds a <strong>12-operator team</strong> from your <strong>owned</strong> operators.</li>
            <li>You set <strong>Required niches</strong>, <strong>Preferred niches</strong>, and other options (e.g. rarity preferences, “want to use”).</li>
            <li>The tool suggests a team that fits your constraints and favors higher-tier operators in each niche (at peak: module &gt; E2 &gt; base).</li>
            <li>You can lock slots, swap operators, and re-run to refine the team.</li>
          </ul>
        </section>

        <section className="guide-section">
          <h2>Integrated Strategies (logged-in only)</h2>
          <ul>
            <li><Link to="/integrated-strategies">Integrated Strategies</Link> is for building teams for the Integrated Strategies (roguelike) mode.</li>
            <li>It uses your <strong>owned</strong> operators and similar preference/niche logic to the main Team Builder, but tuned for IS (e.g. recruitment, temp recruits).</li>
            <li>Use it to plan or adjust your IS roster and see which niches are covered.</li>
          </ul>
        </section>

        <section className="guide-section">
          <h2>Language (operator names)</h2>
          <p>In the <strong>footer</strong>, use the <strong>language selector</strong> to switch operator name language (e.g. EN, CN, TW, JP, KR) where supported. This affects operator names across the site.</p>
        </section>

        <section className="guide-section">
          <h2>Tier lists (niche lists)</h2>
          <h3>Browsing tier lists</h3>
          <ol>
            <li>Go to <Link to="/tier-lists">Tier Lists</Link>.</li>
            <li>You’ll see cards for each <strong>niche</strong> (e.g. “Early Laneholder”, “Attack Debuffing”).</li>
            <li>Click a card to open that niche list.</li>
            <li>Each list shows operators by <strong>rating</strong> (SS, S, A, B, C, D, F), then by rarity and name.</li>
          </ol>

          <h3>How operators are shown</h3>
          <ul>
            <li><strong>Peak-only (default):</strong> Each operator appears <strong>once</strong> in a list, at their <strong>best</strong> form: <strong>Module</strong> (if they have a module in that niche) &gt; <strong>E2</strong> &gt; <strong>base</strong>.</li>
            <li>So you always see “at peak” rankings by default; there are no duplicate rows for the same operator at different promotions.</li>
          </ul>

          <h3>Level badges (E2 / module)</h3>
          <ul>
            <li>By default, <strong>level badges</strong> (E2 or module icons on operator cards) are <strong>hidden</strong>.</li>
            <li>To see which promotion level the ranking assumes, turn on <strong>“Show level badges (E2 / module)”</strong> at the top of the niche list page.</li>
            <li>When on, you’ll see <strong>every evaluation</strong> of each operator (e.g. same operator in SS with module and in S at base).</li>
            <li>The overlay shows a small E2 or module icon on the operator portrait when that level is required for the listed tier.</li>
          </ul>

          <h3>Other details</h3>
          <ul>
            <li><strong>Related Niches</strong> — If the list has related niches, you can jump to them from the same page.</li>
            <li><strong>Owned operators</strong> — If you’re logged in, operators you’ve marked as owned on your profile are visually distinct (e.g. not grayed out) so you can see what you have for that niche.</li>
          </ul>

          <h3>Special lists (from Tier Lists page)</h3>
          <ul>
            <li><Link to="/trash-operators">Trash Operators</Link> — Operators with no optimal use.</li>
            {SHOW_FREE_OPERATORS && <li><Link to="/free-operators">Free Operators</Link> — Operators that are free to obtain.</li>}
            <li><Link to="/global-range-operators">Global Range Operators</Link> — Operators with global range.</li>
            <li><Link to="/unconventional-niches-operators">Unconventional Niches</Link> — Operators that fill unusual roles.</li>
            <li><Link to="/low-rarity-operators">Good Low-Rarity Operators</Link> — Strong low-rarity options.</li>
          </ul>
          <p>These work like other niche lists; they’re just grouped as “special” on the Tier Lists page.</p>
        </section>

        <section className="guide-section">
          <h2>Synergies</h2>
          <h3>What synergies are</h3>
          <p>Synergies describe <strong>themed teams or playstyles</strong> (e.g. “Burn”, “Necrosis”, “Offensive Recovery”). Each synergy has:</p>
          <ul>
            <li><strong>Core</strong> operators (often required or central).</li>
            <li><strong>Optional</strong> operators that fit the theme.</li>
          </ul>

          <h3>Browsing synergies</h3>
          <ol>
            <li>Go to <Link to="/synergies">Synergies</Link>.</li>
            <li>Click a synergy to open its page.</li>
            <li>You’ll see <strong>Core</strong> and <strong>Optional</strong> groups; each group lists operators (with class, rarity, etc.).</li>
          </ol>

          <h3>Level badges on synergies</h3>
          <ul>
            <li>As on tier lists, level badges are <strong>off by default</strong>.</li>
            <li>Use <strong>“Show level badges (E2 / module)”</strong> at the top of the synergy page to show E2/module overlays on operator cards.</li>
          </ul>
        </section>

        <section className="guide-section">
          <h2>All Operators</h2>
          <ul>
            <li><Link to="/all-operators">All Operators</Link> shows the full roster.</li>
            <li>Use <strong>search</strong> and <strong>filters</strong> (rarity, class) to narrow the list.</li>
            <li>Click an operator to open their Operator page.</li>
          </ul>
        </section>

        <section className="guide-section">
          <h2>Operator page</h2>
          <p>From All Operators, a tier list, or a synergy, click an operator to open their detail page. You’ll see:</p>
          <ul>
            <li><strong>Profile</strong> — Portrait, name, rarity, class, global availability.</li>
            <li><strong>Niches</strong> — Every niche list that includes this operator, with <strong>Tier</strong> (e.g. A, S) for that niche. Turn on <strong>“Show level badges (E2 / module)”</strong> in the Niches section to see every evaluation (E2/module) and level badges.</li>
            <li><strong>Synergies</strong> — Synergies they’re part of and their role (core/optional) and groups.</li>
          </ul>
          <p>By default, rankings show one best tier/level per niche (module &gt; E2 &gt; base). With level badges on, you see every evaluation.</p>
        </section>

        <section className="guide-section">
          <h2>Tips</h2>
          <ul>
            <li><strong>Peak-only (default):</strong> Everywhere we rank operators at their <strong>peak</strong> (module &gt; E2 &gt; base). You see one row per operator per list at their best form.</li>
            <li><strong>Level badges:</strong> Turn on “Show level badges” when you want to see every evaluation and whether a ranking is for E2 or a specific module.</li>
            <li><strong>Profile first:</strong> For Team Builder and IS, add your raised operators in Profile so recommendations match what you actually have.</li>
            <li><strong>Want to use:</strong> Mark favorites in Profile so the builders can prefer them when filling teams.</li>
          </ul>
          <p>If something doesn’t work as expected, use the <strong>Feedback</strong> link in the footer to report it.</p>
        </section>
      </div>
    </div>
  );
};

export default UserGuidePage;
