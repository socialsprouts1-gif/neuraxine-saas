-- =========================================================================
-- Clear the invented social proof out of the saved landing page.
--
-- The claims were taken out of the code, but the landing page reads its
-- content from site_content and falls back to the code only for keys the
-- saved row does not have. A row written from the admin editor before the
-- code changed still carried "4.9/5", "Trusted by 50,000+ businesses
-- worldwide" and the invented stat bar — so the claims were still live on
-- the site while the repository looked clean.
--
-- Removing the keys rather than rewriting them puts the defaults back in
-- charge. The editor still works: real numbers can be entered whenever
-- there are any.
-- =========================================================================

update public.site_content
set
  value = value - 'showSocialProof' - 'rating' - 'socialProofText' - 'stats',
  updated_at = now()
where key = 'hero'
  and value ?| array['showSocialProof', 'rating', 'socialProofText', 'stats'];
