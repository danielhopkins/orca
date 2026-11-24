// Checks for rows whose details load late, monitoring with no listed rows, dialogs a row opens,
// and Jump to latest over the open card. Imported by run.mjs.
import { card, events, expanded, focusedRow, toggle } from './fixture-session.mjs'

const rowOf = (id) => `[data-worker-dock-row="${id}"]`
const focusedIs = (page, id) =>
  page.waitForFunction(
    (target) =>
      document.activeElement
        ?.closest('[data-worker-dock-row]')
        ?.getAttribute('data-worker-dock-row') === target,
    id
  )
const loaded = (page, id) =>
  page.waitForFunction((selector) => {
    const state = document.querySelector(selector)?.getAttribute('data-worker-dock-state')
    return state && state !== 'loading'
  }, rowOf(id))

export async function runLoadingAndLayerChecks({ check, scene, assert }) {
  await check('incomplete monitoring with no listed rows keeps the pill and Stop all', () =>
    scene('unlistedOpen720', {}, async (page) => {
      const title = await page.locator('[data-worker-dock-pill-title]').textContent()
      assert(title === 'Background work running', `pill shows "${title}"`)
      assert(!(await card(page).textContent()).includes('unavailable'), 'card says unavailable')
      await page.getByRole('button', { name: 'Stop all' }).click()
      assert(
        (await events(page)).some((event) => event.action === 'stop-all'),
        'no Stop all'
      )
    })
  )

  await check('End on 100 workers with late details focuses the last row and keeps it', () =>
    scene('lazyHundredOpen720', {}, async (page) => {
      await page.locator('[data-worker-dock-open]').first().focus()
      await page.keyboard.press('End')
      await page.waitForFunction(
        () =>
          document.activeElement
            ?.closest('[data-worker-dock-row]')
            ?.getAttribute('data-worker-dock-row') === 'dock:99'
      )
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-worker-dock-row="dock:99"]')
            ?.getAttribute('data-worker-dock-state') !== 'loading'
      )
      assert(
        (await focusedRow(page)) === 'dock:99',
        'focus left the last row when its details came'
      )
      await page.keyboard.press('Enter')
      const opened = (await events(page)).filter((event) => event.action === 'open')
      assert(opened.at(-1)?.id === 'dock:99', `Enter opened ${opened.at(-1)?.id}`)
      await page.keyboard.press('ArrowUp')
      await page.waitForFunction(
        () =>
          document.activeElement
            ?.closest('[data-worker-dock-row]')
            ?.getAttribute('data-worker-dock-row') === 'dock:98'
      )
    })
  )

  await check('rows the card puts first load on opening, and ArrowDown reaches them', () =>
    scene('reorderOpen720', {}, async (page) => {
      const ids = await page.evaluate(() =>
        [...document.querySelectorAll('[data-worker-dock-row]')]
          .slice(0, 2)
          .map((row) => row.getAttribute('data-worker-dock-row'))
      )
      assert(ids.join() === 'dock:49,dock:50', `card leads with ${ids.join()}`)
      await loaded(page, 'dock:50')
      await page.locator(`${rowOf('dock:49')} [data-worker-dock-open]`).focus()
      await page.keyboard.press('ArrowDown')
      await focusedIs(page, 'dock:50')
    })
  )

  await check('closing a row’s details dialog returns focus to that row in its own pane', () =>
    scene('twoPanesCommand720', { width: 760 }, async (page) => {
      const pane = page.locator('[data-fixture-pane="1"]')
      await pane.getByRole('button', { name: /^Command · Check the build/ }).click()
      const dialog = page.getByRole('dialog')
      await dialog.waitFor()
      const box = await dialog.boundingBox()
      await page.mouse.click(box.x + box.width / 2, box.y + 12)
      assert(
        await expanded(page.locator('[data-fixture-pane="1"]')),
        'a press in the dialog folded the card'
      )
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'detached' })
      const where = await page.evaluate(() => {
        const active = document.activeElement
        return {
          pane: active?.closest('[data-fixture-pane]')?.getAttribute('data-fixture-pane'),
          row: active?.hasAttribute('data-worker-dock-open') ?? false
        }
      })
      assert(where.pane === '1' && where.row, `focus went to ${JSON.stringify(where)}`)
    })
  )

  await check(
    'over the open card, Jump to latest rides above it, stays reachable, and still jumps',
    () =>
      scene('jumpFolded720', {}, async (page) => {
        await toggle(page).click()
        await card(page).waitFor()
        await page.waitForTimeout(200)
        const jump = page.getByRole('button', { name: 'Jump to latest' })
        const [a, c] = await Promise.all([jump.boundingBox(), card(page).boundingBox()])
        const gap = c.y - (a.y + a.height)
        assert(Math.abs(gap - 8) <= 1, `Jump to latest sits ${gap}px above the open card`)
        const hit = await page.evaluate(
          ([x, y]) => document.elementFromPoint(x, y)?.closest('button')?.textContent ?? '',
          [a.x + a.width / 2, a.y + a.height / 2]
        )
        assert(hit.includes('Jump to latest'), `the point over Jump hits "${hit}"`)
        await toggle(page).click()
        await page.waitForTimeout(200)
        const [b, p] = await Promise.all([jump.boundingBox(), toggle(page).boundingBox()])
        assert(Math.abs(p.y - (b.y + b.height) - 8) <= 1, 'Jump did not settle back over the pill')
        await jump.click()
        await page.waitForTimeout(200)
        const atEnd = await page.evaluate(() => {
          const element = document.querySelector('[data-fixture-transcript]')
          return element.scrollTop + element.clientHeight >= element.scrollHeight - 2
        })
        assert(atEnd, 'Jump to latest did not reach the end')
      })
  )

  await check('focus the user moves elsewhere during End is not taken back', () =>
    scene('lazyHundredOpen720', {}, async (page) => {
      await page.locator('[data-worker-dock-open]').first().focus()
      await page.keyboard.press('End')
      await page.locator('[data-fixture-composer]').focus()
      await page.waitForTimeout(800)
      const where = await page.evaluate(() =>
        document.activeElement?.hasAttribute('data-fixture-composer')
      )
      assert(where, 'a pending row focus took focus back from the message box')
    })
  )

  await check('after failed detail reads, End again loads the last row and Enter opens it', () =>
    scene('lazyFailingOpen720', {}, async (page) => {
      await page.locator('[data-worker-dock-open]').first().focus()
      await page.keyboard.press('End')
      await focusedIs(page, 'dock:99')
      await page.waitForTimeout(1200)
      await page.keyboard.press('End')
      await loaded(page, 'dock:99')
      assert((await focusedRow(page)) === 'dock:99', 'focus left the last row')
      await page.keyboard.press('Enter')
      const opened = (await events(page)).filter((event) => event.action === 'open')
      assert(opened.at(-1)?.id === 'dock:99', `Enter opened ${opened.at(-1)?.id}`)
    })
  )

  for (const [how, removed] of [
    ['Close', false],
    ['Escape', false],
    ['Close', true],
    ['Escape', true]
  ]) {
    await check(
      `a settled result closed by ${how}${removed ? ' after its row left' : ''} returns focus in its own pane`,
      () =>
        scene('twoPanesCommand720', { width: 760 }, async (page) => {
          const pane = page.locator('[data-fixture-pane="1"]')
          await pane.locator(`${rowOf('dock:0')} [data-worker-dock-open]`).click()
          const dialog = page.getByRole('dialog')
          await dialog.waitFor()
          if (removed) {
            await page.evaluate(() => window.__workerDockHarnesses[1].finish('dock:0'))
            await pane.locator(rowOf('dock:0')).waitFor({ state: 'detached' })
          }
          await (how === 'Close'
            ? dialog.getByRole('button', { name: 'Close' }).click()
            : page.keyboard.press('Escape'))
          await dialog.waitFor({ state: 'detached' })
          await page.waitForTimeout(100)
          const where = await page.evaluate(() => {
            const active = document.activeElement
            return {
              pane: active?.closest('[data-fixture-pane]')?.getAttribute('data-fixture-pane'),
              row: active?.closest('[data-worker-dock-row]')?.getAttribute('data-worker-dock-row'),
              pill: active?.hasAttribute('data-worker-dock-pill') ?? false
            }
          })
          const expected = removed ? where.pill : where.row === 'dock:0'
          assert(where.pane === '1' && expected, `focus went to ${JSON.stringify(where)}`)
        })
    )
  }

  for (const [label, options] of [
    ['normal height', {}],
    ['a 340 x 250 pane', { width: 340, height: 250 }]
  ]) {
    await check(`a full click on Jump to latest over the open card jumps (${String(label)})`, () =>
      scene('jumpFolded720', options, async (page) => {
        await toggle(page).click()
        await card(page).waitFor()
        await page.waitForTimeout(200)
        const jump = page.getByRole('button', { name: 'Jump to latest' })
        const box = await jump.boundingBox()
        assert(box.y >= 0, `Jump to latest is off the pane at y=${box.y}`)
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
        await page.waitForTimeout(250)
        const atEnd = await page.evaluate(() => {
          const element = document.querySelector('[data-fixture-transcript]')
          return element.scrollTop + element.clientHeight >= element.scrollHeight - 2
        })
        assert(atEnd, 'the click did not jump to the end')
      })
    )
  }
}
