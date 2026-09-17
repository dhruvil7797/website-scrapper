-- 6 Pre-built email templates

INSERT OR IGNORE INTO email_templates (id, name, category, subject, body_html, body_text, placeholders) VALUES
(
  'tpl_no_website',
  'No Website — Friendly Intro',
  'no_website',
  'Quick question for {{business_name}}',
  '<p>Hi {{owner_name}},</p><p>I came across {{business_name}} while looking for {{niche}} services in {{city}} and noticed you don''t have a website yet.</p><p>These days, most people search online before calling — even for local services. A simple, professional website could help you:</p><ul><li>Show up when people search "{{niche}} near me" in {{city}}</li><li>Let customers see your services, hours, and reviews</li><li>Get quote requests and calls directly from your site</li></ul><p>I build websites specifically for {{niche}} businesses and have a few examples I''d love to show you: <a href="{{portfolio_link}}">{{portfolio_link}}</a></p><p>Would you be open to a quick 5-minute chat this week?</p><p>Best,<br>{{sender_name}}<br>{{company_name}}<br>{{sending_email}}</p>',
  'Hi {{owner_name}},

I came across {{business_name}} while looking for {{niche}} services in {{city}} and noticed you don''t have a website yet.

These days, most people search online before calling — even for local services. A simple, professional website could help you:

• Show up when people search "{{niche}} near me" in {{city}}
• Let customers see your services, hours, and reviews
• Get quote requests and calls directly from your site

I build websites specifically for {{niche}} businesses and have a few examples I''d love to show you: {{portfolio_link}}

Would you be open to a quick 5-minute chat this week?

Best,
{{sender_name}}
{{company_name}}
{{sending_email}}',
  '["business_name","owner_name","city","niche","portfolio_link","sender_name","company_name","sending_email"]'
),
(
  'tpl_outdated',
  'Website Refresh — Friendly Pitch',
  'outdated',
  'I took a look at {{business_name}}''s website',
  '<p>Hi {{owner_name}},</p><p>I found {{business_name}} while researching {{niche}} businesses in {{city}} and took a look at your website at <a href="{{website_url}}">{{website_url}}</a>.</p><p>You clearly run a great business — {{google_rating}} stars with {{review_count}} reviews speaks for itself. But I noticed your website might not be doing you justice:</p><ul><li>It may not look great on phones (where most local searches happen)</li><li>Page load speed could be improved</li><li>Some features that customers expect might be missing</li></ul><p>I specialize in building modern, fast websites for {{niche}} businesses. Here''s an example: <a href="{{portfolio_link}}">{{portfolio_link}}</a></p><p>Would it be worth a quick call to discuss? No pressure at all.</p><p>Best,<br>{{sender_name}}<br>{{company_name}}<br>{{sending_email}}</p>',
  'Hi {{owner_name}},

I found {{business_name}} while researching {{niche}} businesses in {{city}} and took a look at your website at {{website_url}}.

You clearly run a great business — {{google_rating}} stars with {{review_count}} reviews speaks for itself. But I noticed your website might not be doing you justice:

• It may not look great on phones (where most local searches happen)
• Page load speed could be improved
• Some features that customers expect might be missing

I specialize in building modern, fast websites for {{niche}} businesses. Here''s an example: {{portfolio_link}}

Would it be worth a quick call to discuss? No pressure at all.

Best,
{{sender_name}}
{{company_name}}
{{sending_email}}',
  '["business_name","owner_name","city","niche","website_url","google_rating","review_count","portfolio_link","sender_name","company_name","sending_email"]'
),
(
  'tpl_missing_features',
  'Missing Features — Helpful Suggestion',
  'missing_features',
  'A quick idea for {{business_name}}',
  '<p>Hi {{owner_name}},</p><p>I''ve been researching {{niche}} businesses in {{city}} and came across {{business_name}}. Your website looks good, but I noticed a few features that could help you get more customers:</p><ul><li>Online booking / quote request form</li><li>Mobile-optimized layout</li><li>Customer reviews section</li><li>Service area information</li></ul><p>These are features that top-performing {{niche}} websites use to convert visitors into calls and bookings.</p><p>I''ve built sites with all these features for other {{niche}} businesses — happy to show you: <a href="{{portfolio_link}}">{{portfolio_link}}</a></p><p>Worth a quick chat?</p><p>Best,<br>{{sender_name}}<br>{{company_name}}<br>{{sending_email}}</p>',
  'Hi {{owner_name}},

I''ve been researching {{niche}} businesses in {{city}} and came across {{business_name}}. Your website looks good, but I noticed a few features that could help you get more customers:

• Online booking / quote request form
• Mobile-optimized layout
• Customer reviews section
• Service area information

These are features that top-performing {{niche}} websites use to convert visitors into calls and bookings.

I''ve built sites with all these features for other {{niche}} businesses — happy to show you: {{portfolio_link}}

Worth a quick chat?

Best,
{{sender_name}}
{{company_name}}
{{sending_email}}',
  '["business_name","owner_name","city","niche","portfolio_link","sender_name","company_name","sending_email"]'
),
(
  'tpl_slow',
  'Slow Website — Speed Fix',
  'slow',
  '{{business_name}} website speed tip',
  '<p>Hi {{owner_name}},</p><p>I ran a quick speed test on <a href="{{website_url}}">{{website_url}}</a> and it scored <strong>{{pagespeed_score}}/100</strong> on mobile. That means a lot of potential customers are probably leaving before the page even loads.</p><p>Google says 53% of mobile users leave a site that takes more than 3 seconds to load. For a {{niche}} business in {{city}}, that could mean missed calls every day.</p><p>I build fast, mobile-first websites specifically for {{niche}} businesses. Here''s an example: <a href="{{portfolio_link}}">{{portfolio_link}}</a></p><p>Would you be interested in seeing what a faster version of your site could look like?</p><p>Best,<br>{{sender_name}}<br>{{company_name}}<br>{{sending_email}}</p>',
  'Hi {{owner_name}},

I ran a quick speed test on {{website_url}} and it scored {{pagespeed_score}}/100 on mobile. That means a lot of potential customers are probably leaving before the page even loads.

Google says 53% of mobile users leave a site that takes more than 3 seconds to load. For a {{niche}} business in {{city}}, that could mean missed calls every day.

I build fast, mobile-first websites specifically for {{niche}} businesses. Here''s an example: {{portfolio_link}}

Would you be interested in seeing what a faster version of your site could look like?

Best,
{{sender_name}}
{{company_name}}
{{sending_email}}',
  '["business_name","owner_name","city","niche","website_url","pagespeed_score","portfolio_link","sender_name","company_name","sending_email"]'
),
(
  'tpl_new_business',
  'New Business Welcome',
  'no_presence',
  'Congrats on {{business_name}}!',
  '<p>Hi {{owner_name}},</p><p>I noticed {{business_name}} is relatively new in {{city}} — congratulations on getting started!</p><p>Getting your first customers is the hardest part, and a professional website can make a big difference. Even a simple one-page site helps you:</p><ul><li>Show up in Google searches for "{{niche}} in {{city}}"</li><li>Look professional and trustworthy to new customers</li><li>Give people an easy way to contact you</li></ul><p>I build affordable websites for local {{niche}} businesses. Here are some examples: <a href="{{portfolio_link}}">{{portfolio_link}}</a></p><p>I''d love to help you get set up. Would a quick call work this week?</p><p>Best,<br>{{sender_name}}<br>{{company_name}}<br>{{sending_email}}</p>',
  'Hi {{owner_name}},

I noticed {{business_name}} is relatively new in {{city}} — congratulations on getting started!

Getting your first customers is the hardest part, and a professional website can make a big difference. Even a simple one-page site helps you:

• Show up in Google searches for "{{niche}} in {{city}}"
• Look professional and trustworthy to new customers
• Give people an easy way to contact you

I build affordable websites for local {{niche}} businesses. Here are some examples: {{portfolio_link}}

I''d love to help you get set up. Would a quick call work this week?

Best,
{{sender_name}}
{{company_name}}
{{sending_email}}',
  '["business_name","owner_name","city","niche","portfolio_link","sender_name","company_name","sending_email"]'
),
(
  'tpl_general',
  'General — Cold Intro',
  'general',
  'Website question for {{business_name}}',
  '<p>Hi {{owner_name}},</p><p>I''m reaching out to {{niche}} businesses in {{city}} that might benefit from a stronger online presence.</p><p>I noticed {{business_name}} and thought I could help you attract more customers with a modern, professional website designed specifically for {{niche}} businesses.</p><p>Here''s an example of my work: <a href="{{portfolio_link}}">{{portfolio_link}}</a></p><p>If you''re interested, I''d be happy to hop on a quick call to discuss. No obligation.</p><p>Best,<br>{{sender_name}}<br>{{company_name}}<br>{{sending_email}}</p>',
  'Hi {{owner_name}},

I''m reaching out to {{niche}} businesses in {{city}} that might benefit from a stronger online presence.

I noticed {{business_name}} and thought I could help you attract more customers with a modern, professional website designed specifically for {{niche}} businesses.

Here''s an example of my work: {{portfolio_link}}

If you''re interested, I''d be happy to hop on a quick call to discuss. No obligation.

Best,
{{sender_name}}
{{company_name}}
{{sending_email}}',
  '["business_name","owner_name","city","niche","portfolio_link","sender_name","company_name","sending_email"]'
);
