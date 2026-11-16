import {expect,test,type Locator} from '@playwright/test';
import {seed} from '../src/data';

async function fullyVisible(control:Locator,height:number){
  const box=await control.boundingBox();
  expect(box).not.toBeNull();expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y+box!.height).toBeLessThanOrEqual(height);
}

test('permission validation retains Save and Cancel on a short landscape screen',async({page})=>{
  await page.addInitScript(()=>sessionStorage.setItem('trip-planner-demo-session','active'));
  await page.setViewportSize({width:844,height:390});
  await page.goto('./#/13');
  await page.getByRole('button',{name:'Change permissions for Nora Patel',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Permissions',exact:true});
  await dialog.getByLabel('Role',{exact:true}).selectOption('Day Editor');
  await dialog.getByRole('button',{name:'Save permissions',exact:true}).click();
  await expect(dialog).toContainText('Assign at least one day.');
  await fullyVisible(dialog.getByRole('button',{name:'Save permissions',exact:true}),390);
  await fullyVisible(dialog.getByRole('button',{name:'Cancel',exact:true}),390);
  await dialog.getByRole('checkbox',{name:/Day 2/}).check();
  await dialog.getByRole('button',{name:'Save permissions',exact:true}).click();
  await expect(dialog).toHaveCount(0);
});

test('move validation retains its header and actions while fields scroll',async({page})=>{
  const store=seed();store.userId='nora';store.tripId='seattle';
  const traveler=store.trips.find(trip=>trip.id==='seattle')!.members.find(member=>member.id==='nora')!;
  traveler.role='Day Editor';traveler.days=['2026-10-16'];
  await page.addInitScript(state=>{sessionStorage.setItem('trip-planner-demo-session','active');if(!localStorage.getItem('trip-planner-demo-v1:demo-maya'))localStorage.setItem('trip-planner-demo-v1:demo-maya',JSON.stringify(state));},store);
  await page.setViewportSize({width:844,height:390});
  await page.goto('./#/8?date=2026-10-16');
  await page.getByRole('button',{name:'Move A morning of art',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Move event',exact:true});
  await dialog.getByLabel('New event date').fill('2026-10-17');
  await dialog.getByRole('button',{name:'Move event',exact:true}).click();
  await expect(dialog).toContainText('You do not have permission to move events to this day.');
  await fullyVisible(dialog.getByRole('button',{name:'Move event',exact:true}),390);
  await fullyVisible(dialog.getByRole('button',{name:'Cancel',exact:true}),390);
  await fullyVisible(dialog.getByRole('button',{name:'Close move dialog',exact:true}),390);
  await dialog.getByLabel('New event date').fill('2026-10-16');
  await dialog.getByLabel('New start time').fill('09:17');
  await dialog.getByRole('button',{name:'Move event',exact:true}).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.locator('[data-event-id="museum"]')).toContainText('9:17');
});

test('a very short calendar window still exposes event actions',async({page})=>{
  await page.addInitScript(()=>sessionStorage.setItem('trip-planner-demo-session','active'));
  await page.setViewportSize({width:320,height:256});
  await page.goto('./#/8?date=2026-10-16');
  await page.getByRole('button',{name:'Move A morning of art',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Move event',exact:true});
  await expect(dialog).toBeVisible();
  await fullyVisible(dialog.getByRole('button',{name:'Move event',exact:true}),256);
  await fullyVisible(dialog.getByRole('button',{name:'Close move dialog',exact:true}),256);
  await dialog.getByLabel('New start time').fill('09:17');
  await dialog.getByRole('button',{name:'Move event',exact:true}).click();
  await expect(dialog).not.toBeVisible();
  const opener=page.getByRole('button',{name:'Move A morning of art',exact:true});
  await expect(opener).toBeFocused();
  await expect.poll(()=>opener.evaluate(node=>{
    const box=node.getBoundingClientRect();
    return node.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2));
  })).toBe(true);
});
