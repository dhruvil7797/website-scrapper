# AI Prompts & Instructions

## Prompt 1: Business Info Extraction

Used after scraping a business website to extract structured data.

```
You are analyzing a local business website. Extract the following information as JSON:

{
  "business_name": "exact business name",
  "owner_name": "owner/operator name if found, null otherwise",
  "phone": "primary phone number",
  "email": "contact email if found",
  "address": "full street address",
  "services": ["list", "of", "services", "offered"],
  "hours": "business hours if found",
  "tagline": "their tagline or slogan if any",
  "unique_selling_points": ["what makes them different"],
  "certifications": ["any licenses or certs mentioned"],
  "years_in_business": "number or null",
  "service_areas": ["cities or areas they serve"],
  "social_media": {"facebook": "url", "instagram": "url", ...}
}

Analyze the following website content and screenshot:
[CONTENT/SCREENSHOT INJECTED HERE]
```

## Prompt 2: Site Generation (No Existing Website)

```
You are a senior web designer creating a high-converting single-page website for a local business. Generate a complete, self-contained HTML file with inline CSS (no external dependencies).

## Business Information
- Name: {business_name}
- Niche: {niche}
- Services: {services_list}
- Phone: {phone}
- Address: {address}
- Hours: {hours}
- Owner: {owner_name}

## Design Requirements
1. Modern, professional design that looks like a $5,000 custom site
2. Fully responsive (mobile-first)
3. Single HTML file with all CSS inline (no external stylesheets or JS frameworks)
4. Fast-loading (no heavy assets, use CSS gradients/shapes for visual interest)
5. Color scheme: {color_palette_from_niche}
6. {ui_guidance_from_niche}

## Required Sections (in order)
1. **Hero** - Business name, tagline, prominent phone number, primary CTA button
2. **Services** - Clean grid/list of services offered with icons (use Unicode/CSS icons)
3. **Why Choose Us** - 3-4 trust signals (years in business, certifications, guarantees)
4. **Features** - What their website will offer: {niche_features}
5. **About** - Brief about section with owner name if available
6. **Contact** - Phone, email, address, hours, simple contact form (visual only)
7. **Footer** - Links, business info, service areas

## Style Rules
- Use system fonts (no Google Fonts dependency)
- Smooth scroll behavior
- Subtle animations on scroll (CSS only, no JS libraries)
- High contrast text for readability
- Prominent phone number (click-to-call on mobile)
- Trust badges / certification icons where applicable
- DO NOT include any placeholder text like "Lorem ipsum"
- ALL content must be real, relevant to this specific business

## Reference Sites for Inspiration
[INSPIRATION SCREENSHOTS INJECTED HERE]

Output ONLY the complete HTML. No explanation, no markdown wrapping.
```

## Prompt 3: Site Redesign (Has Existing Website)

```
You are a senior web designer creating a modern redesign of an existing local business website. The current site is outdated. Generate a complete, self-contained HTML file with inline CSS.

## Current Site Analysis
- Screenshot: [CURRENT SITE SCREENSHOT]
- PageSpeed Score: {pagespeed_mobile}/100 (mobile)
- Key issues: {issues_list}

## Business Information
- Name: {business_name}
- Niche: {niche}
- Services: {services_extracted_from_current_site}
- Phone: {phone}
- Address: {address}

## Redesign Goals
1. Keep ALL existing content but present it in a modern, conversion-optimized layout
2. Fix the mobile experience (their current site scores {pagespeed_mobile}/100)
3. Make the design feel premium - like they hired a $5K agency
4. Preserve their brand identity (colors if they have established ones) while modernizing
5. Add features they're missing: {niche_features_not_present}

## Design Requirements
(same as Prompt 2 requirements)

## The redesign should clearly be BETTER than their current site in:
- Visual appeal
- Mobile responsiveness
- Load speed (no heavy assets)
- Clear call-to-action hierarchy
- Trust signal presentation
- Contact information accessibility

## Reference Sites for Inspiration
[INSPIRATION SCREENSHOTS INJECTED HERE]

Output ONLY the complete HTML. No explanation, no markdown wrapping.
```

## Prompt 4: QA Scoring

```
You are a web design quality assurance reviewer. Analyze this generated website screenshot and rate it on a 0.0 to 1.0 scale.

Score based on:
- Visual appeal (is it modern, professional?) - 25%
- Content accuracy (real business info, no placeholders?) - 25%
- Mobile readability (would it work on a phone?) - 20%
- Conversion optimization (clear CTAs, phone number visible?) - 15%
- Trust signals (certifications, reviews, guarantees visible?) - 15%

Return JSON:
{
  "score": 0.87,
  "pass": true,
  "issues": ["list of any problems found"],
  "strengths": ["what's working well"]
}

A score of 0.85+ passes automatically.
A score below 0.85 goes to manual review.

Common failure reasons:
- Placeholder text visible ("Lorem ipsum", "[Your Name Here]")
- Broken layout (overlapping elements, unreadable text)
- Missing critical info (no phone number, no business name)
- Generic/template look (doesn't feel custom)
- Color scheme doesn't match the niche

Screenshot to analyze:
[GENERATED SITE SCREENSHOT]
```

## Prompt 5: Email Generation (No Website)

```
Write a short, personalized cold email to a local {niche} business owner who does NOT have a website. I've built them a sample site to demonstrate what's possible.

## Context
- Owner name: {owner_name} (use "Hi there" if unknown)
- Business: {business_name}
- Location: {city}, {state}
- Google rating: {rating}★ ({review_count} reviews)
- Specific detail: {personalization_detail}

## Email Requirements
1. Subject line: Short, curiosity-driven, no spam triggers (provide 2 options)
2. Opening: Reference something specific about their business
3. Body: Mention I built them a sample site, highlight 2-3 features relevant to their niche
4. CTA: Link to preview, soft ask ("take a look when you get a chance")
5. Closing: Brief, professional, include contact details
6. Tone: Friendly professional, like a neighbor who happens to be a web designer
7. Length: Under 150 words (nobody reads long cold emails)

## Niche-specific features to mention:
{niche_features_top_3}

## Rules
- NO spammy language ("limited time", "act now", "you won't believe")
- NO false urgency
- NO claiming to be a big agency - be authentic (solo operator)
- DO mention "I'll keep this preview up for a couple weeks" (soft time limit)
- DO include the preview link: {portfolio_url}

Return JSON:
{
  "subject_options": ["Subject 1", "Subject 2"],
  "body": "The full email body with {portfolio_url} placeholder for the link"
}
```

## Prompt 6: Email Generation (Website Redesign)

```
Write a short, personalized cold email to a local {niche} business owner whose website is outdated. I've built a modern redesign to show what's possible.

## Context
- Owner name: {owner_name}
- Business: {business_name}
- Current site: {website_url}
- PageSpeed mobile score: {pagespeed_mobile}/100
- Location: {city}, {state}
- Google rating: {rating}★
- Specific detail: {personalization_detail}

## Email Requirements
1. Reference their current site positively first ("I checked out your site...")
2. Mention specific issue (speed score, mobile experience)
3. Say I built a modern version to show the potential
4. Highlight 2-3 improvements visible in the preview
5. Soft CTA - "take a look, no obligation"
6. Under 150 words

## Hard data to include:
"Your current site scores {pagespeed_mobile}/100 on mobile speed - the redesign I built scores 95+."

## Niche-specific features added in redesign:
{niche_features_added}

Return JSON:
{
  "subject_options": ["Subject 1", "Subject 2"],
  "body": "The full email body"
}
```

## Prompt 7: Inspiration Site Discovery

```
You are finding the best-designed websites in the {niche} industry to use as design inspiration. Search for and identify 5-10 websites that represent the gold standard of modern web design for this niche.

Criteria:
- Modern design (2023+ aesthetic)
- Mobile-responsive
- Fast-loading
- High conversion optimization (clear CTAs, trust signals)
- Professional photography/imagery
- Clean typography
- Good use of whitespace

For each site, provide:
{
  "url": "https://...",
  "why_good": "What makes this an excellent example",
  "design_elements_to_borrow": ["specific elements worth replicating"]
}

Niche: {niche}
```

## CTA Footer (Injected Post-Generation)

This HTML is appended to every generated site before upload:

```html
<div style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 48px 24px; text-align: center; margin-top: 64px; border-top: 4px solid #3b82f6;">
  <h2 style="color: #ffffff; font-size: 24px; margin: 0 0 12px; font-family: system-ui, -apple-system, sans-serif;">
    Like what you see?
  </h2>
  <p style="color: #94a3b8; font-size: 16px; margin: 0 0 24px; max-width: 500px; margin-left: auto; margin-right: auto; line-height: 1.6;">
    This preview was built specifically for <strong style="color: #ffffff;">{business_name}</strong>. 
    Reply to the email to get this site live in 48 hours.
  </p>
  <a href="mailto:{your_email}?subject=Interested in the website preview" 
     style="display: inline-block; background: #3b82f6; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; font-family: system-ui, -apple-system, sans-serif;">
    Get This Site Live →
  </a>
  <p style="color: #64748b; font-size: 13px; margin-top: 16px;">
    No obligation • Preview available for a limited time
  </p>
</div>
```
