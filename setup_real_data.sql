-- COMPLETE SETUP SCRIPT FOR PROP-MANAGER (With Payments Sync)
-- COPY THIS CONTENT AND PASTE IT INTO YOUR SUPABASE SQL EDITOR: https://supabase.com/dashboard/project/_/sql

DO $$ 
DECLARE 
    uid uuid := 'PASTE_YOUR_ID_HERE'; -- <--- 1. PASTE YOUR USER ID HERE
    p_heights uuid; p_retreat uuid; p_navasai uuid;
    u_g01 uuid; u_g02 uuid; u_g03 uuid; u_a11 uuid; u_a12 uuid; u_a21 uuid; u_a22 uuid;
    tid_g01 uuid; tid_g02 uuid; tid_g03 uuid; tid_a11 uuid; tid_a12 uuid; tid_a21 uuid; tid_a22 uuid;
BEGIN
    -- STEP 1: CLEAR OLD TEST DATA
    SET session_replication_role = 'replica';
    TRUNCATE table utility_bills, payments, maintenance_requests, leases, tenants, units, properties CASCADE;
    SET session_replication_role = 'origin';

    -- STEP 2: CREATE PROPERTIES
    INSERT INTO properties (name, address, units, user_id) VALUES ('Navasai Heights', 'MIDC Kolhapur', 7, uid) RETURNING id INTO p_heights;
    INSERT INTO properties (name, address, units, user_id) VALUES ('Navasai Retreat', 'Tamgaon', 5, uid) RETURNING id INTO p_retreat;
    INSERT INTO properties (name, address, units, user_id) VALUES ('Navasai', 'Nerli', 10, uid) RETURNING id INTO p_navasai;

    -- STEP 3: CREATE UNITS (Navasai Heights)
    INSERT INTO units (property_id, unit_number, rent, status) VALUES (p_heights, 'G01', 4500, 'Occupied') RETURNING id INTO u_g01;
    INSERT INTO units (property_id, unit_number, rent, status) VALUES (p_heights, 'G02', 8000, 'Occupied') RETURNING id INTO u_g02;
    INSERT INTO units (property_id, unit_number, rent, status) VALUES (p_heights, 'G03', 4500, 'Occupied') RETURNING id INTO u_g03;
    INSERT INTO units (property_id, unit_number, rent, status) VALUES (p_heights, 'A11', 7500, 'Occupied') RETURNING id INTO u_a11;
    INSERT INTO units (property_id, unit_number, rent, status) VALUES (p_heights, 'A12', 6000, 'Occupied') RETURNING id INTO u_a12;
    INSERT INTO units (property_id, unit_number, rent, status) VALUES (p_heights, 'A21', 7500, 'Occupied') RETURNING id INTO u_a21;
    INSERT INTO units (property_id, unit_number, rent, status) VALUES (p_heights, 'A22', 6000, 'Occupied') RETURNING id INTO u_a22;

    -- STEP 4: ONBOARD RESIDENTS
    INSERT INTO tenants (user_id, name, rent, deposit, lease_start, unit_id, phone, status, email) VALUES
    (uid, 'Gourav Kulkarni', 4500, 5000, '2026-02-09', u_g01, '9767533108', 'Active', 'gourav@navasai.com') RETURNING id INTO tid_g01;
    INSERT INTO tenants (user_id, name, rent, deposit, lease_start, unit_id, phone, status, email) VALUES
    (uid, 'Dr. Magdum', 8000, 8000, '2026-02-08', u_g02, '9156204404', 'Active', 'magdum@navasai.com') RETURNING id INTO tid_g02;
    INSERT INTO tenants (user_id, name, rent, deposit, lease_start, unit_id, phone, status, email) VALUES
    (uid, 'Haseen Ahmad Shaikh', 4500, 6000, '2026-01-01', u_g03, '919176000000', 'Active', 'haseen@navasai.com') RETURNING id INTO tid_g03;
    INSERT INTO tenants (user_id, name, rent, deposit, lease_start, unit_id, phone, status, email) VALUES
    (uid, 'Mahadev Ende', 7500, 8000, '2026-02-07', u_a11, '918805000000', 'Active', 'mahadev@navasai.com') RETURNING id INTO tid_a11;
    INSERT INTO tenants (user_id, name, rent, deposit, lease_start, unit_id, phone, status, email) VALUES
    (uid, 'Ganpati Floor Mill', 6000, 6000, '2026-01-01', u_a12, '', 'Active', 'ganpati@navasai.com') RETURNING id INTO tid_a12;
    INSERT INTO tenants (user_id, name, rent, deposit, lease_start, unit_id, phone, status, email) VALUES
    (uid, 'Thorat', 7500, 7000, '2026-01-01', u_a21, '', 'Active', 'thorat@navasai.com') RETURNING id INTO tid_a21;
    INSERT INTO tenants (user_id, name, rent, deposit, lease_start, unit_id, phone, status, email) VALUES
    (uid, 'Kokate', 6000, 6000, '2026-01-01', u_a22, '', 'Active', 'kokate@navasai.com') RETURNING id INTO tid_a22;

    -- STEP 5: INSERT JANUARY 2026 BILLING + PAYMENTS
    INSERT INTO utility_bills (user_id, tenant_id, billing_month, prev_reading, curr_reading, rate_per_unit, fixed_rent, water_bill, total_amount, due_date) VALUES
    (uid, tid_g01, '2026-01', 1443, 1445, 10, 4500, 140, 4790, '2026-01-10'),
    (uid, tid_g03, '2026-01', 2936, 2948, 10, 5000, 140, 5290, '2026-01-10'),
    (uid, tid_g02, '2026-01', 50, 79, 10, 8000, 120, 8410, '2026-01-10'),
    (uid, tid_a12, '2026-01', 4871, 4871, 10, 6000, 100, 6100, '2026-01-10'),
    (uid, tid_a11, '2026-01', 4807, 4871, 10, 7500, 230, 8370, '2026-01-10'),
    (uid, tid_a22, '2026-01', 2993, 2999, 10, 6000, 210, 6360, '2026-01-10'),
    (uid, tid_a21, '2026-01', 870, 871, 10, 7500, 130, 7780, '2026-01-10');

    INSERT INTO payments (tenant_id, amount, due_date, status, method) VALUES
    (tid_g01, 4790, '2026-01-10', 'Paid', 'Utility Bill'),
    (tid_g03, 5290, '2026-01-10', 'Paid', 'Utility Bill'),
    (tid_g02, 8410, '2026-01-10', 'Paid', 'Utility Bill'),
    (tid_a12, 6100, '2026-01-10', 'Paid', 'Utility Bill'),
    (tid_a11, 8370, '2026-01-10', 'Paid', 'Utility Bill'),
    (tid_a22, 6360, '2026-01-10', 'Paid', 'Utility Bill'),
    (tid_a21, 7780, '2026-01-10', 'Paid', 'Utility Bill');

    -- STEP 6: INSERT FEBRUARY 2026 BILLING + PAYMENTS
    INSERT INTO utility_bills (user_id, tenant_id, billing_month, prev_reading, curr_reading, rate_per_unit, fixed_rent, water_bill, total_amount, due_date) VALUES
    (uid, tid_g01, '2026-02', 1448, 1452, 10, 4500, 140, 4790, '2026-02-10'),
    (uid, tid_g02, '2026-02', 79, 100, 10, 9000, 120, 9330, '2026-02-10'),
    (uid, tid_g03, '2026-02', 2942, 2942, 10, 5500, 140, 5640, '2026-02-10'),
    (uid, tid_a11, '2026-02', 4871, 4958, 10, 7000, 250, 8120, '2026-02-10'),
    (uid, tid_a12, '2026-02', 4871, 4871, 10, 7000, 100, 7100, '2026-02-10'),
    (uid, tid_a21, '2026-02', 871, 873, 10, 6500, 140, 6790, '2026-02-10'),
    (uid, tid_a22, '2026-02', 2299, 2313, 10, 6000, 260, 6410, '2026-02-10');

    INSERT INTO payments (tenant_id, amount, due_date, status, method) VALUES
    (tid_g01, 4790, '2026-02-10', 'Paid', 'Utility Bill'),
    (tid_g02, 9330, '2026-02-10', 'Paid', 'Utility Bill'),
    (tid_g03, 5640, '2026-02-10', 'Paid', 'Utility Bill'),
    (tid_a11, 8120, '2026-02-10', 'Paid', 'Utility Bill'),
    (tid_a12, 7100, '2026-02-10', 'Paid', 'Utility Bill'),
    (tid_a21, 6790, '2026-02-10', 'Paid', 'Utility Bill'),
    (tid_a22, 6410, '2026-02-10', 'Paid', 'Utility Bill');

END $$;
