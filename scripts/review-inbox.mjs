#!/usr/bin/env node
// Read-only evidence presentation. Only generated review files are written.
import { readdirSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getCareerOpsRoot } from '../path-resolver.mjs';
import { isMainModule } from '../lib/is-main-module.mjs';
import { writeFileAtomic } from '../tracker-utils.mjs';
import { isDraftCurrent } from './codex-drafts.mjs';
import { outboxSummary } from './application-outbox.mjs';

export const htmlEscape = value => String(value ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const text = value => String(value ?? '').replace(/[\r\n]+/g, ' ');
export function safeWebUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
function localLink(root, path, html = false) {
  const rel = relative(root, path);
  if (rel.startsWith('..'+sep) || rel === '..') throw new Error('Review path outside data root');
  return html ? rel.split(sep).map(encodeURIComponent).join('/') : path.replace(/\\/g, '/');
}

export function renderReview({ root, cards, now = new Date().toISOString(), problems = [], history = [], deliveries = {sent:0,ready:0,unknown:0,rows:[]} }) {
  const md = ['# Поиск работы — результаты', '', `Обновлено: ${now}`, '',
    'Сначала вакансии в Сербии. Оценка и готовые документы не означают отправку. Проверяйте условия трудоустройства и точность текста.', ''];
  md.push(`Подтверждено отправок Gmail: ${deliveries.sent}. Ошибок доставки: ${deliveries.failed_delivery||0}. Готово к отправке: ${deliveries.ready}. Неизвестный исход: ${deliveries.unknown}. Доставка и ответ работодателя проверяются отдельно.`, '');
  const sentRows=deliveries.rows.filter(r=>r.state==='sent');
  if(sentRows.length)md.push('## Отправленные обращения', '', ...sentRows.map(r=>`- ${text(r.company)} — ${text(r.role)}; ${text(r.kind)}; [Gmail](https://mail.google.com/mail/u/0/#sent/${encodeURIComponent(r.receipt.thread_id||r.receipt.id)})`), '');
  const sentHtml=`<section><h2>Отправлено: ${htmlEscape(deliveries.sent)} · неизвестный исход: ${htmlEscape(deliveries.unknown)}</h2><p>Подтверждения Gmail SENT. Ошибок доставки: ${htmlEscape(deliveries.failed_delivery||0)}. Остальная доставка и ответы проверяются отдельно.</p><ul>${sentRows.map(r=>`<li>${htmlEscape(r.company)} — ${htmlEscape(r.role)} (${htmlEscape(r.kind)}) · ${r.delivery==='failed'?'НЕ ДОСТАВЛЕНО · ':''} <a href="https://mail.google.com/mail/u/0/#sent/${encodeURIComponent(r.receipt.thread_id||r.receipt.id)}">Отправленное письмо</a></li>`).join('')}</ul></section>`;
  const blocks = [sentHtml];
  let readyCount = 0;
  for (const card of cards) {
    if (!/^[a-f0-9]{20}$/.test(card.queue_id || '')) throw new Error('Invalid queue id');
    const dir = join(root, 'output', 'drafts', card.queue_id), current = isDraftCurrent(root, card.queue_id);
    const links = [['cv.pdf', 'Резюме PDF'], ['cv.html', 'Резюме в браузере'], ['cover-letter.md', 'Сопроводительное письмо'], ['review.md', 'Что проверить'], ['assessment.md', 'Разбор A–H'], ['form-answers.md', 'Ответы для формы']]
      .filter(([file]) => existsSync(join(dir, file)));
    const url = safeWebUrl(card.url), title = `${card.company} — ${card.role}`;
    const freshness = current ? 'Документы актуальны, ждут проверки.' : links.length ? 'Документы требуют обновления. Старые файлы доступны только для сравнения.' : 'Документы ещё не подготовлены.';
    if (current) readyCount++;
    md.push(`## ${text(title)}`, '', `Соответствие: ${card.fit}/5. Интерес: ${card.interest}/5. ${text(card.decision)}.`, '', freshness, '');
    if (url) md.push(`[Вакансия работодателя](${url})`, '');
    md.push(...links.map(([file, label]) => `- [${label}](<${localLink(root, join(dir, file))}>)`), '', text(card.rationale), '', text(card.employment), '', ...(card.questions || []).map(q => `- ${text(q)}`), '');
    blocks.push(`<article><h2>${htmlEscape(title)}</h2><p class="score">Соответствие ${htmlEscape(card.fit)}/5 · Интерес ${htmlEscape(card.interest)}/5</p><p class="${current ? 'ready' : 'pending'}">${htmlEscape(freshness)}</p><nav>${url ? `<a href="${htmlEscape(url)}" target="_blank" rel="noopener noreferrer">Вакансия ↗</a>` : ''}${links.map(([file,label]) => `<a href="${localLink(root,join(dir,file),true)}">${label}</a>`).join('')}</nav><p>${htmlEscape(card.rationale)}</p><p>${htmlEscape(card.employment)}</p><details><summary>Вопросы и ограничения</summary><ul>${(card.questions||[]).map(q=>`<li>${htmlEscape(q)}</li>`).join('')}</ul></details></article>`);
  }
  md.push('## Прежние обращения', '', '[История писем](<'+localLink(root,join(root,'data','MAIL_HISTORY_REVIEW.md'))+'>)', '', ...history.map(h=>`- ${text(h)}`), '', '## Ошибки и действия', '', ...problems.map(p=>`- ${text(p)}`), '', 'Ничего не отправлено этим экраном.');
  const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Поиск работы — результаты</title><style>body{font:16px/1.55 system-ui,sans-serif;max-width:1050px;margin:40px auto;padding:0 24px;background:#f3f5f8;color:#172331}h1{font-size:32px}article{background:white;border:1px solid #dbe1e8;border-radius:14px;padding:24px;margin:22px 0}h2{margin:0 0 8px;font-size:22px}nav{display:flex;gap:10px;flex-wrap:wrap}a{color:#1749a3}nav a{padding:9px 14px;background:#edf3ff;border-radius:8px;text-decoration:none}.ready{color:#176b4e}.pending{color:#885411}.score{color:#44566c}summary{cursor:pointer}footer{padding:24px 0;color:#536273}</style><h1>Поиск работы</h1><p>${cards.length} вакансий для просмотра · ${readyCount} актуальных пакетов</p><p>Сербское трудоустройство — первый приоритет. Раздел отправлений ниже содержит реальные подтверждения Gmail. Карточки с документами — отдельные черновики, ещё не отправленные через формы.</p>${blocks.join('')}<article><h2>Прежние обращения</h2><a href="data/MAIL_HISTORY_REVIEW.md">История писем</a><ul>${history.map(h=>`<li>${htmlEscape(h)}</li>`).join('')}</ul></article><article><h2>Ошибки и действия</h2><ul>${problems.map(p=>`<li>${htmlEscape(p)}</li>`).join('')}</ul></article><footer>Обновлено ${htmlEscape(now)}. Экран локальный, без отправки заявок и внешних ресурсов.</footer></html>`;
  return { markdown: md.join('\n'), html, readyCount };
}

export function writeReview(root = getCareerOpsRoot()) {
  root = resolve(root);
  const queue = join(root,'data','codex-queue');
  const cards = existsSync(queue) ? readdirSync(queue).filter(f=>/^[a-f0-9]{20}\.result\.json$/.test(f)).map(f=>({...JSON.parse(readFileSync(join(queue,f),'utf8')),queue_id:f.slice(0,20)})).filter(c=>c.decision!=='skip' && c.fit>=3) : [];
  const pipeline = existsSync(join(root,'data','pipeline.md')) ? readFileSync(join(root,'data','pipeline.md'),'utf8') : '';
  const local = new Set(pipeline.split('\n').filter(l=>/Serbia|Srbija|Novi Sad|Belgrade|Beograd|Šimanovci/.test(l)).map(l=>l.match(/https?:\/\/[^\s|]+/)?.[0]).filter(Boolean));
  cards.sort((a,b)=>Number(!local.has(a.url))-Number(!local.has(b.url)) || b.fit-a.fit || b.interest-a.interest);
  const contextPath=join(root,'data','review-context.json');
  const context=existsSync(contextPath)?JSON.parse(readFileSync(contextPath,'utf8')):{};
  const result=renderReview({root,cards,now:context.now,problems:context.problems,history:context.history,deliveries:outboxSummary(root)});
  mkdirSync(root,{recursive:true});
  writeFileAtomic(join(root,'REVIEW_INBOX.md'),result.markdown,{mode:0o600});
  writeFileAtomic(join(root,'REVIEW_INBOX.html'),result.html,{mode:0o600});
  return {cards:cards.length,ready:result.readyCount,html:pathToFileURL(join(root,'REVIEW_INBOX.html')).href};
}
if(isMainModule(import.meta.url)) {
  try { console.log(JSON.stringify(writeReview(),null,2)); }
  catch(error){console.error(error.message);process.exitCode=1;}
}
