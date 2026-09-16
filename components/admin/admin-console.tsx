'use client';

import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  FileText,
  LayoutDashboard,
  MessageSquare,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';

import { SidebarToggle } from '@/components/custom/sidebar-toggle';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { EventFeed } from './event-feed';

import type {
  AdminHistory,
  AdminSettings,
  AdminTurn,
  AdminUsage,
} from '@/lib/admin-types';

import './admin.css';

const number = (value: number | null) =>
  value === null ? 'Not reported' : value.toLocaleString('en-US');
const money = (value: number | null) =>
  value === null
    ? 'Not reported'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 4,
        maximumFractionDigits: 6,
      }).format(value);
const time = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? 'Unable to load admin data');
  return body;
}
const sections = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'logs', label: 'Turn logs', icon: Activity },
  { id: 'conversations', label: 'Conversations', icon: MessageSquare },
  { id: 'events', label: 'System events', icon: Activity },
  { id: 'controls', label: 'Advisor controls', icon: Settings2 },
] as const;
type Section = (typeof sections)[number]['id'];
type Preview = {
  usage: AdminUsage;
  settings: AdminSettings;
  history: AdminHistory;
};

function Status({ value }: { value: string }) {
  return (
    <span className={`ac-status ac-status-${value}`}>
      <span />
      {value}
    </span>
  );
}
function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="ac-empty">
      <MessageSquare size={24} />
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}

export function AdminConsole({ preview }: { preview?: Preview }) {
  const [section, setSection] = useState<Section>('overview');
  const [day, setDay] = useState(preview?.usage.day ?? today());
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [turn, setTurn] = useState<AdminTurn | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [history, setHistory] = useState<AdminHistory | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const historyRequest = useRef(0);
  const [docsStatus, setDocsStatus] = useState<{
    documentSource: string;
    documentsFetchedAt: string;
  } | null>(null);
  const [docsBusy, setDocsBusy] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);
  const usage = useSWR<AdminUsage>(
    preview ? null : `/api/admin/usage?day=${day}&limit=100`,
    fetcher,
    { revalidateOnFocus: false }
  );
  const settings = useSWR<AdminSettings>(
    preview ? null : '/api/admin/settings',
    fetcher,
    { revalidateOnFocus: false }
  );
  const data = preview?.usage ?? (usage.error ? undefined : usage.data);
  const config =
    preview?.settings ?? (settings.error ? undefined : settings.data);
  const term = query.toLowerCase().trim();
  const matches = (...values: (string | null)[]) =>
    values.some((value) => value?.toLowerCase().includes(term));
  const turns =
    data?.recentTurns.filter(
      (t) =>
        (status === 'all' || t.status === status) &&
        matches(
          t.email,
          t.displayName,
          t.userInput,
          t.assistantResponse,
          t.model
        )
    ) ?? [];
  const people =
    data?.users.filter((p) => matches(p.displayName, p.email, p.userId)) ?? [];
  const conversations =
    data?.recentConversations.filter((c) =>
      matches(c.title, c.email, c.displayName)
    ) ?? [];

  async function loadHistory(id: string, offset = 0) {
    const request = ++historyRequest.current;
    setHistoryBusy(true);
    setHistoryError(null);
    try {
      const result =
        preview?.history ??
        (await fetcher<AdminHistory>(
          `/api/admin/conversations/${id}?offset=${offset}`
        ));
      if (request === historyRequest.current)
        setHistory((previous) =>
          offset && previous
            ? {
                ...result,
                messages: [...previous.messages, ...result.messages],
              }
            : result
        );
    } catch (error) {
      if (request === historyRequest.current)
        setHistoryError(
          error instanceof Error ? error.message : 'Could not load conversation'
        );
    } finally {
      if (request === historyRequest.current) setHistoryBusy(false);
    }
  }
  useEffect(
    () => () => {
      historyRequest.current++;
    },
    []
  );
  function openConversation(id: string) {
    setHistory(null);
    setConversationId(id);
    void loadHistory(id);
  }
  async function checkDocs() {
    setDocsBusy(true);
    setDocsError(null);
    setDocsStatus(null);
    try {
      setDocsStatus(
        preview
          ? {
              documentSource: 'cache',
              documentsFetchedAt: preview.usage.generatedAt,
            }
          : await fetcher('/api/admin/docs-status')
      );
    } catch (error) {
      setDocsError(
        error instanceof Error ? error.message : 'Could not check documents'
      );
    } finally {
      setDocsBusy(false);
    }
  }
  function navigate(id: Section) {
    setSection(id);
    setQuery('');
    setStatus('all');
  }

  return (
    <div className="ac-root">
      <div className="ac-main">
        <header className="ac-topbar">
          <div className="ac-header-title">
            <SidebarToggle />
            <div>
              <strong><span aria-hidden="true">👎</span> DeInfluenceMe</strong>
              <span>Admin view</span>
            </div>
          </div>
          <Link href="/" className="ac-button">
            <ArrowLeft size={15} />
            Back to chat
          </Link>
        </header>
        <nav className="ac-tabs" aria-label="Admin navigation">
          {sections.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              aria-current={section === item.id ? 'page' : undefined}
              className={section === item.id ? 'ac-tab-active' : ''}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          ))}
        </nav>
        <main className="ac-content">
          {preview && (
            <div className="ac-preview" role="status">
              Design preview · All names, conversations, and metrics below are
              synthetic. No live services are called.
            </div>
          )}
          <div className="ac-heading">
            <div>
              <p className="ac-eyebrow">ADMIN WORKSPACE</p>
              <h1>
                {section === 'overview'
                  ? 'Overview'
                  : section === 'logs'
                    ? 'Turn logs'
                    : section === 'events'
                      ? 'System events'
                      : section === 'conversations'
                        ? 'Conversations'
                        : 'Advisor controls'}
              </h1>
              <p>
                {section === 'overview'
                  ? 'Monitor activity, review usage, and see where attention is needed.'
                  : section === 'logs'
                    ? 'Review user input, responses, and the outcome of each request.'
                    : section === 'events'
                      ? 'Inspect cache activity, request limits, and service failures.'
                    : section === 'conversations'
                      ? 'Open the stored history of recent conversations across your workspace.'
                      : 'Review the active limits and manage your source documents.'}
              </p>
            </div>
          </div>
          {section !== 'controls' && (
            <div className="ac-toolbar">
              <div className="ac-date">
                <label htmlFor="ac-day">Usage date</label>
                <input
                  id="ac-day"
                  type="date"
                  value={day}
                  disabled={!!preview}
                  onChange={(e) => {
                    if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value))
                      setDay(e.target.value);
                  }}
                />
                <span>Manila time · UTC+8</span>
              </div>
              <button
                className="ac-button"
                disabled={!!preview || usage.isValidating}
                onClick={() => { void usage.mutate(); }}
              >
                <RefreshCw
                  size={15}
                  className={usage.isValidating ? 'ac-spin' : ''}
                />
                {usage.isValidating ? 'Refreshing' : 'Refresh data'}
              </button>
            </div>
          )}
          {usage.error && section !== 'controls' && (
            <div className="ac-error" role="alert">
              <strong>Unable to load this view.</strong> {usage.error.message}{' '}
              <button onClick={() => { void usage.mutate(); }}>Try again</button>
            </div>
          )}
          {!data && !usage.error && section !== 'controls' && (
            <div className="ac-loading" role="status">
              Loading workspace activity…
            </div>
          )}
          {data && section === 'overview' && (
            <>
              <div className="ac-stats">
                {[
                  {
                    label: 'Users with usage records',
                    value: number(data.totals.users),
                    detail: 'For the selected day',
                    icon: Users,
                  },
                  {
                    label: 'Requests counted',
                    value: number(data.totals.messages),
                    detail: 'Accepted requests, including failures',
                    icon: MessageSquare,
                  },
                  {
                    label: 'Tokens accounted',
                    value: number(data.totals.tokens),
                    detail: 'Includes estimates when usage is unknown',
                    icon: Activity,
                  },
                  {
                    label: 'Estimated spend',
                    value: money(data.totals.estimatedCostUsd),
                    detail: 'USD · recorded provider usage',
                    icon: ShieldCheck,
                  },
                ].map((stat) => (
                  <section className="ac-stat" key={stat.label}>
                    <div>
                      {stat.label}
                      <stat.icon size={17} />
                    </div>
                    <strong>{stat.value}</strong>
                    <p>{stat.detail}</p>
                  </section>
                ))}
              </div>
              <div className="ac-overview-grid">
                <section className="ac-panel">
                  <div className="ac-panel-heading">
                    <div>
                      <h2>Usage by person</h2>
                      <p>
                        Daily totals and progress toward the current message
                        cap.
                      </p>
                    </div>
                    <span className="ac-count">{data.users.length} users</span>
                  </div>
                  <SearchBox
                    value={query}
                    onChange={setQuery}
                    placeholder="Find a person…"
                  />
                  {people.length ? (
                    <div className="ac-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Person</th>
                            <th>Requests counted</th>
                            <th>Tokens</th>
                            <th>Est. spend</th>
                          </tr>
                        </thead>
                        <tbody>
                          {people.map((person) => (
                            <tr key={person.userId}>
                              <td>
                                <div className="ac-person">
                                  <span className="ac-avatar">
                                    {(person.displayName ?? person.email ?? '?')
                                      .slice(0, 1)
                                      .toUpperCase()}
                                  </span>
                                  <div>
                                    <strong>
                                      {person.displayName ??
                                        person.email ??
                                        'Unknown user'}
                                    </strong>
                                    <small>
                                      {person.email ?? person.userId}
                                    </small>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <strong>{number(person.messagesToday)}</strong>
                                {config && (
                                  <>
                                    <span className="ac-muted">
                                      {' '}
                                      /{' '}
                                      {number(config.limits.dailyMessageLimit)}
                                    </span>
                                    <div
                                      className="ac-meter"
                                      aria-hidden="true"
                                    >
                                      <span
                                        style={{
                                          width: `${Math.min(100, (person.messagesToday / config.limits.dailyMessageLimit) * 100)}%`,
                                        }}
                                      />
                                    </div>
                                  </>
                                )}
                              </td>
                              <td>{number(person.tokensToday)}</td>
                              <td>{money(person.estimatedCostUsd)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty
                      title={query ? 'No matching people' : 'No usage recorded'}
                      detail={
                        query
                          ? 'Try another name or email.'
                          : 'Usage will appear after advisor turns are recorded for this day.'
                      }
                    />
                  )}
                </section>
                <section className="ac-panel ac-attention">
                  <div className="ac-panel-heading">
                    <div>
                      <h2>Request outcomes</h2>
                      <p>
                        Latest {data.recentTurns.length} requests on this day.
                      </p>
                    </div>
                  </div>
                  {['completed', 'blocked', 'failed', 'processing'].map(
                    (value) => (
                      <button
                        key={value}
                        onClick={() => {
                          navigate('logs');
                          setStatus(value);
                        }}
                      >
                        <Status value={value} />
                        <strong>
                          {
                            data.recentTurns.filter((t) => t.status === value)
                              .length
                          }
                        </strong>
                        <ChevronRight size={15} />
                      </button>
                    )
                  )}
                  <div className="ac-note">
                    Outcome counts cover up to 100 recent requests. Usage totals
                    above cover the selected day.
                  </div>
                </section>
              </div>
              <section className="ac-panel ac-recent">
                <div className="ac-panel-heading">
                  <div>
                    <h2>Recent activity</h2>
                    <p>A quick look at the latest advisor requests.</p>
                  </div>
                  <button
                    className="ac-text-button"
                    onClick={() => navigate('logs')}
                  >
                    View turn logs <ArrowUpRight size={15} />
                  </button>
                </div>
                {data.recentTurns.length ? (
                  data.recentTurns.slice(0, 4).map((t) => (
                    <button
                      key={t.id}
                      className="ac-activity-row"
                      onClick={() => setTurn(t)}
                    >
                      <span className="ac-activity-icon">
                        <MessageSquare size={17} />
                      </span>
                      <span>
                        <strong>{t.userInput}</strong>
                        <small>
                          {t.displayName ?? t.email ?? 'Unknown user'} ·{' '}
                          {time(t.createdAt)}
                        </small>
                      </span>
                      <Status value={t.status} />
                      <ChevronRight size={16} />
                    </button>
                  ))
                ) : (
                  <Empty
                    title="No requests yet"
                    detail="Completed, blocked, and failed requests will appear here."
                  />
                )}
              </section>
            </>
          )}
          {data && section === 'logs' && (
            <section className="ac-panel">
              <div className="ac-panel-heading">
                <div>
                  <h2>Turn log</h2>
                  <p>
                    Showing {turns.length} of {data.recentTurns.length} loaded
                    requests · latest 100 for the selected day.
                  </p>
                </div>
                <label className="ac-filter">
                  Outcome
                  <select
                    aria-label="Filter by outcome"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    {[
                      'all',
                      'completed',
                      'blocked',
                      'failed',
                      'processing',
                    ].map((s) => (
                      <option key={s} value={s}>
                        {s === 'all' ? 'All outcomes' : s}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <SearchBox
                value={query}
                onChange={setQuery}
                placeholder="Search loaded requests by person, message, or model…"
              />
              {turns.length ? (
                <div className="ac-table-wrap">
                  <table className="ac-log-table">
                    <thead>
                      <tr>
                        <th>Request / person</th>
                        <th>Outcome</th>
                        <th>Tokens</th>
                        <th>Est. spend</th>
                        <th>Time (Manila)</th>
                        <th>
                          <span className="sr-only">Review</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {turns.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <button
                              className="ac-request"
                              onClick={() => setTurn(t)}
                            >
                              {t.userInput}
                            </button>
                            <small>
                              {t.displayName ?? t.email ?? t.userId}
                            </small>
                          </td>
                          <td>
                            <Status value={t.status} />
                          </td>
                          <td>{number(t.totalTokens)}</td>
                          <td>{money(t.estimatedCostUsd)}</td>
                          <td className="ac-nowrap">{time(t.createdAt)}</td>
                          <td>
                            <button
                              className="ac-text-button"
                              onClick={() => setTurn(t)}
                              aria-label={`Review request: ${t.userInput}`}
                            >
                              Review <ChevronRight size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="No matching requests"
                  detail="Choose another date, search term, or outcome."
                />
              )}
            </section>
          )}
          {data && section === 'conversations' && (
            <section className="ac-panel">
              <div className="ac-panel-heading">
                <div>
                  <h2>Recent conversations</h2>
                  <p>
                    Latest 100 across all dates · the usage date filter does not
                    restrict this list.
                  </p>
                </div>
                <span className="ac-count">{conversations.length} shown</span>
              </div>
              <SearchBox
                value={query}
                onChange={setQuery}
                placeholder="Search recent conversations or people…"
              />
              {conversations.length ? (
                conversations.map((c) => (
                  <button
                    className="ac-conversation"
                    key={c.id}
                    onClick={() => openConversation(c.id)}
                  >
                    <span className="ac-activity-icon">
                      <MessageSquare size={20} />
                    </span>
                    <span>
                      <strong>{c.title}</strong>
                      <small>{c.displayName ?? c.email ?? c.userId}</small>
                    </span>
                    <span className="ac-conversation-date">
                      Updated {time(c.updatedAt)}
                    </span>
                    <ChevronRight size={18} />
                  </button>
                ))
              ) : (
                <Empty
                  title="No conversations found"
                  detail="Stored conversations will appear here when available."
                />
              )}
            </section>
          )}
          {section === 'events' && <EventFeed day={day} />}

          {section === 'controls' && (
            <>
              {settings.error && (
                <div className="ac-error" role="alert">
                  {settings.error.message}{' '}
                  <button onClick={() => void settings.mutate()}>
                    Try again
                  </button>
                </div>
              )}
              {!config && !settings.error && (
                <div className="ac-loading" role="status">
                  Loading advisor settings…
                </div>
              )}
              {config && (
                <div className="ac-controls-grid">
                  <section className="ac-panel">
                    <div className="ac-panel-heading">
                      <div>
                        <h2>Usage guardrails</h2>
                        <p>Server-enforced limits for each person.</p>
                      </div>
                      <ShieldCheck size={20} />
                    </div>
                    <dl className="ac-settings">
                      <div>
                        <dt>Daily message cap</dt>
                        <dd>
                          {number(config.limits.dailyMessageLimit)}{' '}
                          <small>messages / person</small>
                        </dd>
                      </div>
                      <div>
                        <dt>Daily token cap</dt>
                        <dd>
                          {number(config.limits.dailyTokenLimit)}{' '}
                          <small>tokens / person</small>
                        </dd>
                      </div>
                      <div>
                        <dt>Rate limit</dt>
                        <dd>
                          {number(config.limits.requestsPerMinute)}{' '}
                          <small>requests / minute / person</small>
                        </dd>
                      </div>
                      <div>
                        <dt>Model route</dt>
                        <dd className="ac-model">
                          {config.model ?? 'Not configured'}
                        </dd>
                      </div>
                    </dl>
                    <div className="ac-note">
                      Limits are managed in the server environment. Change the
                      ADVISOR_DAILY_MESSAGE_LIMIT, ADVISOR_DAILY_TOKEN_LIMIT, or
                      ADVISOR_REQUESTS_PER_MINUTE setting and restart the
                      server. Daily usage resets at midnight in Manila.
                    </div>
                  </section>
                  <section className="ac-panel">
                    <div className="ac-panel-heading">
                      <div>
                        <h2>Source documents</h2>
                        <p>
                          Edit in Google Docs. Changes apply through the cache.
                        </p>
                      </div>
                      <FileText size={20} />
                    </div>
                    <div className="ac-doc-links">
                      {[
                        {
                          title: 'System instructions',
                          subtitle: 'Role, scope, and behavior',
                          url: config.promptUrl,
                        },
                        {
                          title: 'Reference guidance',
                          subtitle: 'Voice, facts, and grounding',
                          url: config.referenceUrl,
                        },
                      ].map((doc) =>
                        doc.url ? (
                          <a
                            key={doc.title}
                            href={doc.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <FileText size={20} />
                            <span>
                              <strong>{doc.title}</strong>
                              <small>{doc.subtitle}</small>
                            </span>
                            <ArrowUpRight size={18} />
                          </a>
                        ) : (
                          <p key={doc.title}>{doc.title}: not configured</p>
                        )
                      )}
                    </div>
                    <div className="ac-cache">
                      <span>Cache lifetime</span>
                      <strong>{number(config.cacheTtlSeconds)} seconds</strong>
                    </div>
                    <div className="ac-doc-check">
                      <button
                        className="ac-button"
                        disabled={docsBusy}
                        onClick={() => void checkDocs()}
                      >
                        <RefreshCw
                          size={15}
                          className={docsBusy ? 'ac-spin' : ''}
                        />
                        {docsBusy ? 'Checking…' : 'Check document connection'}
                      </button>
                      {docsStatus && (
                        <p role="status">
                          <Check size={16} />
                          {docsStatus.documentSource === 'stale-cache'
                            ? 'Using last valid cache; document refresh unavailable.'
                            : `Available from ${docsStatus.documentSource}.`}{' '}
                          Last fetched {time(docsStatus.documentsFetchedAt)}.
                        </p>
                      )}
                      {docsError && (
                        <p className="ac-error" role="alert">
                          {docsError}
                        </p>
                      )}
                    </div>
                    <div className="ac-note">
                      Document content stays on the server. This check may
                      refresh an expired cache; it does not generate a model
                      response.
                    </div>
                  </section>
                </div>
              )}
              <section className="ac-eval">
                <span className="ac-activity-icon">
                  <ShieldCheck size={22} />
                </span>
                <div>
                  <h2>Quality review is part of the workflow.</h2>
                  <p>
                    Review relevant, off-topic, adversarial, and limit cases.
                    The project includes a 10-case evaluation worksheet in{' '}
                    <code>docs/ADMIN_EVALUATION.md</code>. Results must be
                    recorded after running the tests; no evaluation score is
                    assumed.
                  </p>
                </div>
              </section>
            </>
          )}
          <footer className="ac-footer">
            <span>Eskwelabs · DeInfluenceMe</span>
            <span>
              {data
                ? `Snapshot ${time(data.generatedAt)} · Manila time`
                : 'Administrator workspace'}
            </span>
          </footer>
        </main>
      </div>
      <Dialog
        open={!!turn}
        onOpenChange={(open) => {
          if (!open) setTurn(null);
        }}
      >
        <DialogContent className="ac-dialog sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Turn review</DialogTitle>
            <DialogDescription>
              {turn &&
                `${turn.displayName ?? turn.email ?? 'Unknown user'} · ${time(turn.createdAt)} (Manila)`}
            </DialogDescription>
          </DialogHeader>
          {turn && (
            <div className="ac-detail">
              <Status value={turn.status} />
              <dl className="ac-detail-grid">
                <div>
                  <dt>Input tokens</dt>
                  <dd>{number(turn.promptTokens)}</dd>
                </div>
                <div>
                  <dt>Output tokens</dt>
                  <dd>{number(turn.completionTokens)}</dd>
                </div>
                <div>
                  <dt>Estimated cost</dt>
                  <dd>{money(turn.estimatedCostUsd)}</dd>
                </div>
                <div>
                  <dt>Model</dt>
                  <dd>{turn.model ?? 'Not reported'}</dd>
                </div>
                <div>
                  <dt>Document source</dt>
                  <dd>{turn.documentSource ?? 'Not loaded'}</dd>
                </div>
                <div>
                  <dt>Completed</dt>
                  <dd>
                    {turn.completedAt
                      ? time(turn.completedAt)
                      : 'Not completed'}
                  </dd>
                </div>
              </dl>
              {(turn.blockReason || turn.errorCode) && (
                <p className="ac-error">
                  Reason: {turn.blockReason ?? turn.errorCode}
                </p>
              )}
              <h3>User input</h3>
              <div className="ac-message">{turn.userInput}</div>
              <h3>Advisor response</h3>
              <div className="ac-message">
                {turn.assistantResponse ??
                  'No response was saved for this request.'}
              </div>
              <p className="ac-request-id">Request ID: {turn.requestId}</p>
              {turn.conversationId && (
                <button
                  className="ac-button"
                  onClick={() => {
                    const id = turn.conversationId;
                    setTurn(null);
                    if (id) openConversation(id);
                  }}
                >
                  Open full conversation <ArrowUpRight size={15} />
                </button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!conversationId}
        onOpenChange={(open) => {
          if (!open) {
            historyRequest.current++;
            setConversationId(null);
          }
        }}
      >
        <DialogContent className="ac-dialog sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {history?.conversation.title ?? 'Conversation history'}
            </DialogTitle>
            <DialogDescription>
              Stored messages in sequence · read-only administrator review
            </DialogDescription>
          </DialogHeader>
          <div className="ac-detail">
            {history?.messages.map((message) => (
              <article className="ac-history-message" key={message.id}>
                <header>
                  <strong>
                    {message.role === 'assistant' ? 'Advisor' : 'User'}
                  </strong>
                  <span>{time(message.created_at)}</span>
                </header>
                <div className="ac-message">{message.content}</div>
              </article>
            ))}
            {history && !history.messages.length && (
              <Empty
                title="No saved messages"
                detail="This conversation has no completed messages yet."
              />
            )}
            {historyBusy && <p role="status">Loading messages…</p>}
            {historyError && (
              <div className="ac-error" role="alert">
                {historyError}{' '}
                <button
                  onClick={() => {
                    if (conversationId)
                      void loadHistory(
                        conversationId,
                        history?.nextOffset ?? 0
                      );
                  }}
                >
                  Try again
                </button>
              </div>
            )}
            {history?.nextOffset !== null &&
              history?.nextOffset !== undefined && (
                <button
                  className="ac-button"
                  disabled={historyBusy}
                  onClick={() => {
                    if (conversationId)
                      void loadHistory(conversationId, history.nextOffset!);
                  }}
                >
                  Load more messages
                </button>
              )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="ac-search">
      <Search size={16} />
      <input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
