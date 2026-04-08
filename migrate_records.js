import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
  console.log("Fetching existing bills and payments...");
  const { data: bills, error: billsErr } = await supabase.from('utility_bills').select('*');
  const { data: payments, error: payErr } = await supabase.from('payments').select('*');

  if (billsErr || payErr) {
    console.error("Error fetching data:", billsErr || payErr);
    return;
  }

  let updatedBills = 0;
  let updatedPayments = 0;

  for (const bill of bills) {
    // Find matching payment based on old logic: tenant_id, due_date, and approx amount
    const match = payments.find(p => 
      p.tenant_id === bill.tenant_id && 
      p.due_date === bill.due_date && 
      Math.abs(Number(p.amount) - Number(bill.total_amount)) < 1
    );

    let balance_due = Number(bill.total_amount);

    if (match) {
      if (match.status === 'Paid') {
        balance_due = 0;
      }
      
      if (!match.bill_id) {
        const { error: updatePayErr } = await supabase.from('payments')
          .update({ bill_id: bill.id })
          .eq('id', match.id);
        
        if (!updatePayErr) {
          updatedPayments++;
          console.log(`Linked payment ${match.id} to bill ${bill.id}`);
        } else {
          console.error(`Failed to link payment ${match.id}:`, updatePayErr);
        }
      }
    }

    if (bill.balance_due == null) {
      const { error: updateBillErr } = await supabase.from('utility_bills')
        .update({ balance_due: balance_due })
        .eq('id', bill.id);
      
      if (!updateBillErr) {
        updatedBills++;
        console.log(`Set balance_due = ${balance_due} for bill ${bill.id}`);
      } else {
        console.error(`Failed to update bill ${bill.id}:`, updateBillErr);
      }
    }
  }

  console.log(`Migration complete. Updated ${updatedBills} bills and ${updatedPayments} payments.`);
}

migrate();