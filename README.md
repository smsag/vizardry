# Vizardry

An [Obsidian](https://obsidian.md) plugin that renders product management frameworks as visual canvases inline in Read View — using fenced code blocks as input.

---

## How it works

Write a fenced code block with the framework name as the language tag, then fill in the blocks using `key: value` syntax. Switch to **Read View** to see the rendered canvas.

Multi-line content uses YAML-style block scalars (`|`):

```
key: Single line value

key: |
  First line
  Second line
  Third line
```

---

## Business Model Canvas

**Code block:**

~~~
```bmc
key_partners: Hardware manufacturers, Payment processors
key_activities: Platform development, Customer support
key_resources: Engineering team, Brand, Proprietary data
value_propositions: One tool that replaces five — focused, fast, distraction-free
customer_relationships: In-app onboarding, Community forum, Email support
channels: App Store, Product Hunt, SEO, Word of mouth
customer_segments: |
  Freelancers and solo founders
  Small teams up to 10 people
cost_structure: |
  Engineering salaries
  Cloud infrastructure
  Marketing and ads
revenue_streams: |
  Monthly SaaS subscription
  Annual plan (2 months free)
```
~~~

**Renders as a 9-block canvas:**

| Key Partners | Key Activities | Value Propositions | Customer Relationships | Customer Segments |
|---|---|---|---|---|
| Key Partners | Key Resources | Value Propositions | Channels | Customer Segments |
| **Cost Structure** | | | **Revenue Streams** | |

---

## Lean Canvas

**Code block:**

~~~
```lean
problem: |
  Workflow tools are too complex
  Teams waste hours on setup, not work
solution: |
  Zero-config workspace
  Works out of the box in under 2 minutes
unique_value_proposition: The workspace that gets out of your way
unfair_advantage: 3-year dataset of workflow patterns, no competitor has it
customer_segments: |
  Early-stage startups
  Remote-first teams
key_metrics: |
  Daily active users
  Time-to-first-value
  30-day retention
channels: |
  Product Hunt launch
  Developer newsletters
  Referral program
cost_structure: |
  Engineering team (3 FTE)
  AWS infrastructure
revenue_streams: |
  $12/month per seat
  Enterprise annual contracts
```
~~~

---

## Supported frameworks

| Code block | Framework | Version |
|---|---|---|
| ` ```bmc ` | Business Model Canvas | v0.1 |
| ` ```lean ` | Lean Canvas | v0.1 |

More frameworks planned: RICE Scoring, Jobs-to-be-Done, Empathy Map, Opportunity Solution Tree.

---

## Syntax reference

- **Simple value:** `key: Your content here`
- **Multi-line value:** use `|` on the first line, indent content below
- **Unknown keys** are silently ignored
- **Duplicate keys** — last one wins
- **Comments** start with `#`

---

## Installation via BRAT (beta)

1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat) from the Obsidian community plugins
2. Open BRAT settings → **Add Beta Plugin**
3. Enter: `https://github.com/steffenseitz/vizardry`
4. Enable **Vizardry** in Settings → Community plugins

---

## Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/steffenseitz/vizardry/releases)
2. Copy them into your vault at `.obsidian/plugins/vizardry/`
3. Enable **Vizardry** in Settings → Community plugins

---

## License

MIT © [Steffen Seitz](mailto:vizardry@grembl.de)
