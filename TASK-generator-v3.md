# Task: Build Generator V3 - kiro-cli + Design Skills Pipeline

## Context
The client-scraper project at `/home/dhruvill/Desktop/Projects/client-scraper` needs its website generator rewritten.

**Current state**: generator-v2.ts uses Bedrock Claude API directly. It produces technically correct HTML (score 1.00) but visually boring - all sites look the same, no images, no real logos, looks like AI template.

**Goal**: Use kiro-cli with the `website-generator` agent (already registered at `~/.kiro/agents/website-generator.json`) which has file write permissions. Each pipeline step uses specific design skills from `packages/worker/src/prompts/` to produce premium, distinctive sites.

## Architecture

### Agent
- Name: `website-generator` (already registered)
- Invoke: `echo "<prompt>" | kiro-cli chat --no-interactive --agent website-generator`
- The agent has `fs_write` and `write` in allowedTools - it writes HTML directly to files
- TESTED AND WORKING: confirmed it can write files

### Pipeline Steps
1. **Structure + Content** (Skills: frontend-design + ui-ux-pro-max Python search)
   - Prompt includes: real business data from scraper (services, headings, social links), design system from Python lookup, frontend-design skill for bold aesthetic
   - Agent writes to: `/tmp/client-scraper-gen/<prospect_id>-step1.html`

2. **Visual Polish** (Skills: polish + bolder + colorize)
   - Reads step1 HTML, applies visual enhancements
   - Agent writes to: `/tmp/client-scraper-gen/<prospect_id>-step2.html`

3. **Animation + Delight** (Skills: animate)
   - Reads step2 HTML, adds scroll animations and micro-interactions
   - Agent writes to: `/tmp/client-scraper-gen/<prospect_id>-step3.html`

4. **Validation** (Puppeteer - programmatic, no AI)
   - Same checks as generator-v2: box-sizing, @media, business name, tel: link, sections, page height
   - Pass threshold: score >= 0.70 and issues <= 2

5. **Targeted Fix** (if validation fails)
   - One kiro-cli call with specific issues to fix

### Key Design Decisions
- Each step reads the previous step's output file and writes a new file
- Skills are loaded from: `packages/worker/src/prompts/mac-skills/<name>/SKILL.md`
- Design system lookup: `python3 packages/worker/src/prompts/fadekingzz-steering/ui-ux-pro-max/scripts/search.py "<niche> local service" --design-system`
- Real data from scraper stored in `source_data` JSON field: services, headings, socialLinks, pageTitle, bodyTextPreview
- Screenshots stored in R2 at: `screenshots/<prospect_id>.png`
- Logo: extract from scraped website favicon or og:image if available
- NO auth gate needed (removed - nothing requires midway/kerberos)
- Parallel: scraper + generator + mailer all run via Promise.allSettled

### Files
- New: `packages/worker/src/pipeline/generator-v3.ts`
- Update: `packages/worker/src/index.ts` (change import from generator-v2 to generator-v3)
- Skills at: `packages/worker/src/prompts/mac-skills/` (19 skills) and `packages/worker/src/prompts/fadekingzz-steering/` (7 skills)
- Config: `packages/worker/src/config.ts` (generationMaxPerRun: 10)
- Cloudflare D1 API token in `.env` as CLOUDFLARE_API_TOKEN
- R2 bucket: client-scraper-assets

### Testing
After building, run: `cd packages/worker && timeout 300 npx tsx src/index.ts --test-generator 2>&1 | grep -E "Pipeline|Step|Done|Validate|Success|Failed"`

Then check the generated site: query D1 for `SELECT business_name, generated_site_url FROM prospects WHERE stage = 'pending_approval' ORDER BY updated_at DESC LIMIT 1`

### Critical Rules
- Do NOT dump all 500KB of skills into one prompt - load only the relevant skill per step (2-5KB each)
- The prompt for each step must include the OUTPUT FILE PATH and instruct the agent to write there
- Use `timeout 300` when invoking kiro-cli (5 min max per step)
- After building, test on ONE prospect and verify the HTML quality by checking the file
- If kiro-cli still produces garbage output, the fallback is: use Bedrock (generator-v2) for structure, then kiro-cli for polish steps only (hybrid approach)

### After Success
- Ping user on Slack thread 1784818020.220069 in channel D0BA1JXLE0J with the generated site URL
- Save progress to memory
