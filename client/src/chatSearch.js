export function filterChatEvents(events, search) {
  const query = search.trim().toLocaleLowerCase();
  if (!query) return events;
  return events.filter((event) => [event.displayName, event.text, event.reaction]
    .some((value) => typeof value === 'string' && value.toLocaleLowerCase().includes(query)));
}
