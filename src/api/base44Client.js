export const base44 = {
  auth: { 
    me: async () => ({ id: 'offline-mechanic', role: 'admin' }) 
  },
  functions: {
    invoke: async (name, payload) => {
      console.log('Offline function call:', name, payload);
      return { data: { reply: "Master Mechanic is currently in offline mode. Native AI integration pending." } };
    }
  },
  entities: {
    Ticket: {
      update: async (id, data) => { console.log('Offline ticket update:', id, data); }
    }
  }
};
