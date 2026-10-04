document.addEventListener('DOMContentLoaded', () => {
    // URL to the "Menu"
    const DATA_URL = 'data/services.json';

    // Fetch the data
    fetch(DATA_URL)
        .then(response => response.json())
        .then(data => {
            console.log("Franchise Data Loaded:", data);
            updateSubscription(data.subscription);
            renderServices(data.services);
        })
        .catch(error => console.error('Error loading franchise data:', error));
});

function updateSubscription(subData) {
    // Update Price
    document.getElementById('sub-price').textContent = subData.price;
    document.getElementById('sub-name').textContent = subData.name;

    // Update Features List
    const featureList = document.getElementById('sub-features');
    featureList.innerHTML = ''; // Clear hardcoded items
    
    subData.features.forEach(feature => {
        const li = document.createElement('li');
        li.innerHTML = `✅ ${feature}`;
        featureList.appendChild(li);
    });
}

function renderServices(services) {
    const serviceContainer = document.getElementById('services-grid');
    serviceContainer.innerHTML = ''; // Clear current content

    services.forEach(service => {
        const card = document.createElement('div');
        card.className = 'feature-card'; // Re-using existing CSS class for styling
        
        card.innerHTML = `
            <div class="icon">🛠️</div>
            <h3>${service.name}</h3>
            <p>${service.description}</p>
            <div style="margin-top: 1rem; font-weight: 900; font-size: 1.2rem; color: #D32F2F;">
                $${service.price.toFixed(2)}
            </div>
            <button class="btn-nav" style="margin-top:0.5rem; width:100%">Add to Ticket</button>
        `;
        
        serviceContainer.appendChild(card);
    });
}
