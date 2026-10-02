/** Scrolls a sideways tab bar so its active tab is in view. */
export function revealActiveTab(bar: HTMLElement | null | undefined) {
  bar
    ?.querySelector('[data-state="active"]')
    ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
