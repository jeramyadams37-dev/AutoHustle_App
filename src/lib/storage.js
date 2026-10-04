import { Preferences } from '@capacitor/preferences';
const TICKETS_KEY = 'autohustle_tickets';
export const LocalDB = {
  async getTickets() { const { value } = await Preferences.get({ key: TICKETS_KEY }); return value ? JSON.parse(value) : []; },
  async getTicketById(id) { const tickets = await this.getTickets(); return tickets.find((t) => t.id === id) || null; },
  async saveTicket(ticket) {
    const tickets = await this.getTickets();
    const existingIndex = tickets.findIndex((t) => t.id === ticket.id);
    if (existingIndex >= 0) tickets[existingIndex] = { ...tickets[existingIndex], ...ticket, updated_at: new Date().toISOString() };
    else tickets.unshift({ ...ticket, id: ticket.id || `TKT-${Date.now()}`, created_at: new Date().toISOString() });
    await Preferences.set({ key: TICKETS_KEY, value: JSON.stringify(tickets) }); return ticket;
  },
  async deleteTicket(id) {
    const tickets = await this.getTickets();
    await Preferences.set({ key: TICKETS_KEY, value: JSON.stringify(tickets.filter((t) => t.id !== id)) });
  }
};
