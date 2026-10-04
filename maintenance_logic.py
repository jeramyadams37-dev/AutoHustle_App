import datetime

class CustomerVehicle:
    def __init__(self, owner_name, vehicle_model, current_mileage, last_service_mileage):
        self.owner_name = owner_name
        self.vehicle_model = vehicle_model
        self.current_mileage = current_mileage
        self.last_service_mileage = last_service_mileage
        self.service_interval = 5000 
        self.alert_threshold = 500

    def check_maintenance_status(self):
        miles_remaining = self.service_interval - (self.current_mileage - self.last_service_mileage)
        
        status = {
            "needs_service": False,
            "message": ""
        }

        if miles_remaining <= 0:
            status["needs_service"] = True
            status["message"] = f"URGENT: {self.vehicle_model} overdue by {abs(miles_remaining)} miles."
        elif miles_remaining <= self.alert_threshold:
            status["message"] = f"HEADS UP: {self.vehicle_model} due in {miles_remaining} miles."
        else:
            status["message"] = f"All good. {miles_remaining} miles to go."
            
        return status

# Test Run
print("--- AutoHustle System Check ---")
test_car = CustomerVehicle("Jeremy", "Chevy Impala", 104800, 100000)
result = test_car.check_maintenance_status()
print(f"Vehicle: {test_car.vehicle_model}")
print(f"Status: {result['message']}")
