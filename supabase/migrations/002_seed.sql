-- Demo seed (run after 001; uses service role or direct DB access)
-- Creates a demo org + agent + contacts + mock calls for the dashboard UI

-- Demo org
insert into organizations (id, name, plan) values
  ('00000000-0000-0000-0000-000000000001', 'Acme Corp Demo', 'growth')
on conflict do nothing;

-- Demo phone number (140-series, DLT approved)
insert into phone_numbers (org_id, e164, provider, series, dlt_status, status) values
  ('00000000-0000-0000-0000-000000000001', '+911400000001', 'mock', '140', 'approved', 'active'),
  ('00000000-0000-0000-0000-000000000001', '+911600000001', 'mock', '1600', 'approved', 'active')
on conflict do nothing;

-- Demo agents
insert into agents (id, org_id, name, direction, language, system_prompt, first_message, status) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'Priya - Sales Agent', 'outbound', 'hinglish',
   'You are Priya, a friendly sales agent for Acme Corp. Your goal is to qualify leads and schedule demos.',
   'Namaste! Main Priya bol rahi hoon Acme Corp se. Kya aap humare product ke baare mein jaanna chahenge?',
   'active'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'Arjun - Support Agent', 'inbound', 'hi',
   'You are Arjun, a helpful customer support agent for Acme Corp. Resolve queries efficiently and politely.',
   'Namaskar! Main Arjun hoon Acme Corp customer care se. Aapki kaise madad kar sakta hoon?',
   'active')
on conflict do nothing;

-- Demo contact list
insert into contact_lists (id, org_id, name, description) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'Q1 Leads', 'Qualified leads for Q1 outbound campaign')
on conflict do nothing;

-- Demo contacts
insert into contacts (id, org_id, name, e164, consent_given, consent_source, consent_at) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Rajesh Kumar', '+919876543001', true, 'website_form', now() - interval '10 days'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Sunita Sharma', '+919876543002', true, 'website_form', now() - interval '8 days'),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Amit Singh', '+919876543003', true, 'import', now() - interval '5 days'),
  ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Deepa Nair', '+919876543004', true, 'website_form', now() - interval '3 days'),
  ('30000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Vikram Patel', '+919876543005', false, null, null)
on conflict do nothing;

-- List members
insert into contact_list_members (list_id, contact_id) values
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003'),
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004')
on conflict do nothing;

-- Demo campaign
insert into campaigns (id, org_id, agent_id, name, contact_list_id, call_category, status, calls_total, calls_completed, calls_failed) values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001', 'Q1 Sales Blitz', '20000000-0000-0000-0000-000000000001',
   'transactional', 'done', 4, 3, 1)
on conflict do nothing;

-- Demo calls
insert into calls (id, org_id, agent_id, campaign_id, contact_id, direction, from_e164, to_e164, status, started_at, answered_at, ended_at, duration_sec, disposition, sentiment, summary) values
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001',
   'outbound', '+911400000001', '+919876543001', 'ended',
   now() - interval '2 days' + interval '10 hours',
   now() - interval '2 days' + interval '10 hours' + interval '5 seconds',
   now() - interval '2 days' + interval '10 hours' + interval '3 minutes',
   175, 'interested', 'positive',
   'Customer Rajesh expressed strong interest in the premium plan. Scheduled demo for next Tuesday.'),

  ('50000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000002',
   'outbound', '+911400000001', '+919876543002', 'ended',
   now() - interval '2 days' + interval '11 hours',
   now() - interval '2 days' + interval '11 hours' + interval '4 seconds',
   now() - interval '2 days' + interval '11 hours' + interval '2 minutes',
   140, 'callback', 'neutral',
   'Sunita asked for a callback next week. Currently evaluating competitors.'),

  ('50000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000003',
   'outbound', '+911400000001', '+919876543003', 'ended',
   now() - interval '1 day' + interval '10 hours',
   now() - interval '1 day' + interval '10 hours' + interval '3 seconds',
   now() - interval '1 day' + interval '10 hours' + interval '4 minutes',
   245, 'completed', 'positive',
   'Amit is interested. Demo scheduled. Sent follow-up email.'),

  ('50000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000004',
   'outbound', '+911400000001', '+919876543004', 'no_answer',
   now() - interval '1 day' + interval '14 hours',
   null, now() - interval '1 day' + interval '14 hours' + interval '30 seconds',
   null, 'no_answer', null, null),

  ('50000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000002', null,
   '30000000-0000-0000-0000-000000000001',
   'inbound', '+919876543001', '+911600000001', 'ended',
   now() - interval '6 hours',
   now() - interval '6 hours' + interval '2 seconds',
   now() - interval '6 hours' + interval '5 minutes',
   298, 'completed', 'positive',
   'Customer called about billing issue. Resolved successfully.')
on conflict do nothing;

-- Demo transcripts
insert into transcripts (call_id, role, text, seq, ts) values
  ('50000000-0000-0000-0000-000000000001', 'agent', 'Namaste! Main Priya bol rahi hoon Acme Corp se. Kya aap humare product ke baare mein jaanna chahenge?', 1, now() - interval '2 days' + interval '10 hours'),
  ('50000000-0000-0000-0000-000000000001', 'caller', 'Haan, zaroor. Kya karta hai aapka product?', 2, now() - interval '2 days' + interval '10 hours' + interval '10 seconds'),
  ('50000000-0000-0000-0000-000000000001', 'agent', 'Humara product AI-powered voice calling solution hai jo aapke business ke liye automated calls karta hai. Aapke sales team ki productivity 3x increase ho sakti hai.', 3, now() - interval '2 days' + interval '10 hours' + interval '20 seconds'),
  ('50000000-0000-0000-0000-000000000001', 'caller', 'Interesting! Pricing kya hai?', 4, now() - interval '2 days' + interval '10 hours' + interval '35 seconds')
on conflict do nothing;

-- Usage ledger
insert into usage_ledger (org_id, period, minutes_used, calls_count, cost) values
  ('00000000-0000-0000-0000-000000000001', '2026-06', 47.5, 5, 4.75)
on conflict do nothing;
