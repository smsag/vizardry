# Vizardry

An [Obsidian](https://obsidian.md) plugin that renders product management frameworks as visual canvases inline in Read View — using fenced code blocks as input.

---

## How it works

Write a fenced code block with the framework name as the language tag, fill in the blocks using `key: value` syntax, then switch to **Read View** to see the rendered canvas.

Multi-line content uses YAML-style block scalars (`|`):

```
key: Single line value

key: |
  First line
  Second line
  Third line
```

---

## Supported frameworks

| Code block | Framework | Layout |
|---|---|---|
| ` ```bmc ` | Business Model Canvas | 5-column grid |
| ` ```lean ` | Lean Canvas | 5-column grid |
| ` ```opportunity ` | Opportunity Canvas | 5-column grid |
| ` ```leanux ` | Lean UX Canvas | 5-column grid |
| ` ```vpc ` | Value Proposition Canvas | 2-column grid |
| ` ```kata ` | Product Kata | 2-column grid |
| ` ```jobs ` | Jobs Canvas | 3-column grid |
| ` ```impact ` | Impact Map | Hierarchical tree |

---

## Inserting a canvas

Three ways to insert a fully structured empty template at your cursor:

**Command palette** — `Cmd+P` (macOS) / `Ctrl+P` (Windows/Linux) → search **Insert canvas** → pick a framework from the fuzzy list.

**Per-framework commands** — search the framework name directly in `Cmd+P` (e.g. "Insert Business Model Canvas"). Each framework has its own command, bindable to a keyboard shortcut in Settings → Hotkeys.

**Ribbon icon** — tap the template icon in the left sidebar to open the same fuzzy picker.

On **mobile**, add any Vizardry command to the editor toolbar via Settings → Mobile → Edit toolbar for one-tap access above the keyboard.

---

## Examples

### Business Model Canvas

~~~
```bmc
key_partners: Suppliers, Logistics partners
key_activities: Product development, Marketing
key_resources: Team, Brand, Platform
value_propositions: Save time and reduce cost
customer_relationships: Self-service, Email support
channels: App store, Website
customer_segments: Small business owners
cost_structure: Salaries, Hosting, Ads
revenue_streams: Subscriptions, One-time licenses
```
~~~

### Lean Canvas

~~~
```lean
problem: Too many manual steps in daily workflow
solution: One-click automation for common tasks
unique_value_proposition: 10x faster than the status quo
unfair_advantage: Proprietary dataset, 3-year head start
customer_segments: Freelancers and solo founders
key_metrics: DAU, activation rate, churn
channels: Product Hunt, SEO, Word of mouth
cost_structure: Engineering salaries, Cloud hosting
revenue_streams: Monthly SaaS subscription
```
~~~

### Opportunity Canvas

~~~
```opportunity
problem_opportunity: Manual reporting takes 4+ hours per week
solution_ideas: Automated report generation, smart templates
target_users: Operations managers, analysts
user_outcomes: Reclaim time, reduce errors
user_metrics: Hours saved per week, error rate
business_problem: High churn from power users citing workflow friction
business_metrics: Churn rate, feature adoption
budget: 2 engineers, 1 quarter
adoption_factors: In-app prompt, onboarding flow
factors_for_success: Low setup friction, works with existing data
```
~~~

### Lean UX Canvas

~~~
```leanux
business_problem: Users drop off during onboarding before reaching the first value moment
business_outcomes: Increase 7-day retention by 20%
users: First-time SaaS buyers with no technical background
user_outcomes: Feel confident and productive within 10 minutes
solutions: Guided setup wizard, contextual tooltips, sample data
hypotheses: |
  If we add a guided wizard, users will reach first value faster
  If we show sample data, users will understand the product sooner
most_important_assumption: Users abandon because setup feels overwhelming
minimum_experiment: A/B test wizard vs. blank start with 500 new signups
```
~~~

### Value Proposition Canvas

~~~
```vpc
products_services: |
  Automated reporting suite
  One-click export to PDF and Slides
pain_relievers: Eliminates manual data gathering and formatting
gain_creators: Delivers polished reports in seconds instead of hours
customer_jobs: Produce weekly status reports for stakeholders
pains: Repetitive, error-prone work that takes hours every week
gains: More time for analysis, look credible in front of leadership
```
~~~

### Product Kata

~~~
```kata
current_condition: Onboarding takes 3 days and requires manual handholding from CS
target_condition: New users reach first value moment within 30 minutes, unassisted
obstacles: |
  No in-app guidance exists
  Sample data is not representative of real use cases
  Setup requires 12 manual configuration steps
next_experiment: Ship a 5-step guided wizard for the top user job-to-be-done
expected_outcome: 40% of new signups complete setup without contacting support
```
~~~

### Jobs Canvas

~~~
```jobs
job_performer: Operations manager at a 50-person company
main_job: Produce accurate weekly reports for leadership without stress
circumstances: End of week, under time pressure, data spread across three tools
functional_aspects: Pull data, calculate KPIs, format slides, send by Friday noon
emotional_aspects: Wants to feel in control and look competent in front of the CEO
social_aspects: Seen as the person who "always has the numbers ready"
current_solutions: Excel + copy-paste from dashboards + manual PowerPoint formatting
desired_outcomes: |
  Done in under 30 minutes
  No manual errors
  Presentable without extra design work
obstacles: Data lives in three separate tools with no shared export format
```
~~~

### Impact Map

~~~
```impact
goal: Increase 30-day retention by 15%

actor: Product Team
  impact: Reduce time-to-first-value
    deliverable: Onboarding wizard
    deliverable: Empty state templates
  impact: Surface progress milestones
    deliverable: Progress bar in dashboard

actor: Marketing Team
  impact: Re-engage dormant users
    deliverable: Day-7 reactivation email
  impact: Set clearer expectations pre-signup
    deliverable: Revised landing page copy

actor: Customer Success
  impact: Catch at-risk accounts early
    deliverable: Health score dashboard
    deliverable: Automated check-in workflow
```
~~~

**Impact Map syntax rules:**
- `goal:` and `actor:` — no indent
- `impact:` — indented once (2 spaces)
- `deliverable:` — indented twice (4 spaces)
- Any number of actors, impacts per actor, and deliverables per impact

---

## Linking blocks to document headings

Add a `_links:` section to connect canvas blocks to headings in the same note. A small link icon appears on the block; tapping it scrolls to that heading.

~~~
```lean
problem: Too many manual steps
solution: One-click automation
customer_segments: Solo founders

_links:
  problem: 1. Why? — Problem & Opportunity
  solution: 2. How? — Our Approach
  customer_segments: 3. Who? — Target Users
```
~~~

- Only linked blocks show the icon
- Heading text must match the document heading exactly
- Works with any framework

---

## Presentation mode

Each canvas has a small expand icon (⛶) in its title bar. Tapping it opens a full-screen overlay that covers the entire Obsidian UI — including sidebars and toolbars.

**On iPhone connected to Apple TV via screen mirroring**, this fills the TV output, giving you a clean single-canvas presentation view directly from your notes.

- All grid blocks are shown at once (mobile carousel is suspended)
- Larger type for readability at a distance
- Impact Map scrolls vertically within the overlay
- **Dismiss:** tap the ✕ button, press Escape, or swipe down

---

## Syntax reference

| Syntax | Meaning |
|---|---|
| `key: value` | Single-line value |
| `key: \|` followed by indented lines | Multi-line value |
| `_links:` followed by indented `key: heading` pairs | Link blocks to headings |
| `# comment` | Ignored line |
| Unknown keys | Silently ignored |
| Duplicate keys | Last one wins |

---

## Installation via BRAT (beta)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) from the Obsidian community plugins
2. BRAT settings → **Add Beta Plugin**
3. Enter: `https://github.com/smsag/vizardry`
4. Enable **Vizardry** in Settings → Community plugins

---

## Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/smsag/vizardry/releases)
2. Copy them into your vault at `.obsidian/plugins/vizardry/`
3. Enable **Vizardry** in Settings → Community plugins

---

## License

MIT © [Steffen Seitz](mailto:vizardry@grembl.de)
