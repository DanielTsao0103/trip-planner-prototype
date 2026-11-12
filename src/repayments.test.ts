import test from 'node:test';
import assert from 'node:assert/strict';
import type {Expense} from './domain.ts';
import {recordRepayment,repaymentPaid} from './repayments.ts';
const expense=():Expense=>({id:'expense',purpose:'Lunch',amount:2000,category:'Food',payer:'payer',shares:{payer:1000,debtor:1000},date:'2027-01-01',source:'Manual',settled:[]});
test('repayment corrections append history and retain the original expense lock',()=>{
 const e=expense();const original=structuredClone(e);
 recordRepayment(e,'debtor','payer','paid','', '2027-01-02T00:00:00Z');
 const paid=structuredClone(e.repaymentHistory![0]);
 recordRepayment(e,'debtor','payer','unpaid','Payment was not received');
 assert.equal(repaymentPaid(e,'debtor'),false);
 assert.deepEqual(e.settled,['debtor']);
 assert.deepEqual(e.repaymentHistory![0],paid);
 recordRepayment(e,'debtor','payer','paid');
 assert.equal(repaymentPaid(e,'debtor'),true);
 assert.equal(e.repaymentHistory?.length,3);
 assert.deepEqual({...e,settled:[],repaymentHistory:undefined},{...original,repaymentHistory:undefined});
});
test('legacy paid records remain correctable without inventing original metadata',()=>{
 const e=expense();e.settled=['debtor'];recordRepayment(e,'debtor','payer','unpaid','Marked the wrong person');
 assert.equal(e.repaymentHistory?.[0].recordedAt,undefined);
 assert.equal(e.repaymentHistory?.[0].status,'unpaid');assert.equal(repaymentPaid(e,'debtor'),false);
});
test('repayment transitions reject other actors, missing reasons and repeated actions',()=>{
 const e=expense();
 assert.throws(()=>recordRepayment(e,'debtor','other','paid'),/Only the payer/);
 assert.throws(()=>recordRepayment(e,'payer','payer','paid'),/Only the payer/);
 assert.throws(()=>recordRepayment(e,'debtor','payer','unpaid','Reason'),/changed/);
 recordRepayment(e,'debtor','payer','paid');
 assert.throws(()=>recordRepayment(e,'debtor','payer','paid'),/changed/);
 assert.throws(()=>recordRepayment(e,'debtor','payer','unpaid',' '),/reason/);
 assert.throws(()=>recordRepayment(e,'debtor','payer','unpaid','x'.repeat(221)),/reason/);
 assert.equal(e.repaymentHistory?.length,1);
});
