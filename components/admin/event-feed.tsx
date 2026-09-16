'use client';
import useSWR from 'swr';

type Event = {
  id: string;
  event_name: string;
  request_id: string | null;
  metadata: Record<string, string | number | boolean>;
  created_at: string;
};
export function EventFeed({ day }: { day: string }) {
  const { data, error, isLoading, mutate } = useSWR<{ events: Event[] }>(
    `/api/admin/events?day=${day}`,
    async (url: string) => {
      const response = await fetch(url, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Unable to load events');
      return body;
    }
  );
  return (
    <section className="ac-panel">
      <div className="ac-panel-heading">
        <div>
          <h2>System events</h2>
          <p>
            Latest 100 events for this Manila calendar day. Private prompt
            content is excluded.
          </p>
        </div>
        <button className="ac-button" onClick={() => void mutate()}>
          Refresh events
        </button>
      </div>
      {error ? (
        <p role="alert">Unable to load events. Try refreshing.</p>
      ) : isLoading ? (
        <p>Loading events…</p>
      ) : !data?.events.length ? (
        <div className="ac-empty">
          <h3>No events yet</h3>
          <p>Send a message to see cache, provider, and limit activity here.</p>
        </div>
      ) : (
        <div className="ac-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Event</th>
                <th>Details</th>
                <th>Request</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((event) => (
                <tr key={event.id}>
                  <td>
                    {new Date(event.created_at).toLocaleTimeString('en-US', {
                      timeZone: 'Asia/Manila',
                    })}
                  </td>
                  <td>{event.event_name.replaceAll('_', ' ')}</td>
                  <td>
                    {Object.entries(event.metadata)
                      .map(
                        ([key, value]) =>
                          `${key.replaceAll('_', ' ')}: ${value}`
                      )
                      .join(' · ') || '—'}
                  </td>
                  <td>
                    <code title={event.request_id ?? ''}>
                      {event.request_id?.slice(0, 8) ?? 'System'}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
