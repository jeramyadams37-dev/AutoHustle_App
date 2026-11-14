// Vehicle delete helper — AH-B2 decision, in one place so the Garage
// and the test agree.
//
// DECISION: deleting a vehicle deletes its tickets too.
// A ticket points at its vehicle (vehicle_id). If the vehicle went
// away and the tickets stayed, they would be orphans: still listed
// on Home's Recent Tickets, opening a ticket whose vehicle no longer
// exists, with no way to clean them up from the Garage (the vehicle
// card they hung under is gone). So the delete is one action —
// vehicle + its tickets — and the confirm names the ticket count,
// so the driver always sees what is about to go. A vehicle with no
// tickets just deletes itself.
//
// The Garage deletes the tickets first, then the vehicle, so a
// failure half-way leaves the vehicle (and its tickets) still there
// instead of a vehicle with half its tickets gone.
export function vehicleDeleteConfirmText(vehicleName, ticketCount) {
  if (ticketCount > 0) {
    return `Delete ${vehicleName} and its ${ticketCount} ticket${ticketCount === 1 ? '' : 's'}? This can't be undone.`;
  }
  return `Delete ${vehicleName}? This can't be undone.`;
}

export function ticketIdsForVehicle(tickets, vehicleId) {
  return (tickets || []).filter((t) => t.vehicle_id === vehicleId).map((t) => t.id);
}
