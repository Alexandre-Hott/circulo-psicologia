import { test, expect } from '@playwright/test'

const viewports=[320,390,768,1280]

async function checkLayout(page,testInfo,stage){
  const metrics=await page.evaluate(()=>({
    viewport:window.innerWidth,
    documentWidth:document.documentElement.scrollWidth,
    bodyWidth:document.body.scrollWidth,
    dialogs:[...document.querySelectorAll('[role="dialog"]')].map(dialog=>{
      const rect=dialog.getBoundingClientRect()
      return {left:rect.left,right:rect.right,width:rect.width}
    }),
    overflow:[...document.querySelectorAll('body *')].filter(element=>{
      const rect=element.getBoundingClientRect()
      return rect.width&&rect.right>window.innerWidth+1&&getComputedStyle(element).position!=='fixed'
    }).slice(0,12).map(element=>({tag:element.tagName,className:element.className,text:element.textContent?.slice(0,60),right:Math.round(element.getBoundingClientRect().right)})),
  }))
  await page.screenshot({path:testInfo.outputPath(`${stage}.png`),fullPage:true})
  expect(metrics.documentWidth,`${stage}: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(metrics.viewport+1)
  expect(metrics.bodyWidth,`${stage}: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(metrics.viewport+1)
  for(const dialog of metrics.dialogs){
    expect(dialog.left,`${stage}: ${JSON.stringify(metrics)}`).toBeGreaterThanOrEqual(-1)
    expect(dialog.right,`${stage}: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(metrics.viewport+1)
  }
}

for(const width of viewports){
  test(`core screens stay within the ${width}px viewport`,async({page},testInfo)=>{
    await page.setViewportSize({width,height:800})
    await page.goto('/')
    await checkLayout(page,testInfo,'patients')
    await page.getByRole('button',{name:/Luna Martins/}).click()
    await checkLayout(page,testInfo,'profile')
    await page.getByRole('button',{name:/Iniciar sessão/}).click()
    await page.getByRole('button',{name:/Continuar/}).click()
    await page.getByRole('button',{name:'Não quero responder'}).click()
    await page.getByRole('button',{name:/Continuar/}).click()
    await checkLayout(page,testInfo,'observations')
    await page.getByRole('button',{name:/Continuar/}).click()
    await checkLayout(page,testInfo,'indicators')

    await page.goto('/')
    await page.getByRole('navigation').getByRole('button',{name:'Biblioteca'}).click()
    await checkLayout(page,testInfo,'library')
    await page.goto('/')
    await page.getByRole('navigation').getByRole('button',{name:'Agenda'}).click()
    await page.getByRole('button',{name:'Mês',exact:true}).click()
    await checkLayout(page,testInfo,'calendar-month')
    await page.getByRole('button',{name:/Novo compromisso recorrente/}).click()
    await checkLayout(page,testInfo,'calendar-dialog')
  })
}
