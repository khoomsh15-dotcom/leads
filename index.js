const { Telegraf } = require('telegraf');
const axios = require('axios');
const fs = require('fs');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const Groq = require('groq-sdk');
const express = require('express');

// 1. RENDER KEEP-ALIVE
const app = express();
app.get('/', (req, res) => res.send('System Status: 🟢 Dual Bots Active'));
app.listen(process.env.PORT || 3000);

// 2. BOT CONFIGURATION
const leadBot = new Telegraf(process.env.LEAD_BOT_TOKEN);
const logBot = new Telegraf(process.env.LOG_BOT_TOKEN);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MY_ID = process.env.MY_CHAT_ID;

// 3. CSV WRITER INITIALIZATION
const csvWriter = createCsvWriter({
    path: 'verified_hq_leads.csv',
    header: [
        {id: 'name', title: 'Business Name'}, {id: 'category', title: 'Category'},
        {id: 'city', title: 'City'}, {id: 'phone', title: 'Phone'},
        {id: 'email', title: 'Email'}, {id: 'socials', title: 'Socials'},
        {id: 'rating', title: 'Rating'}, {id: 'reviews', title: 'Reviews'},
        {id: 'whyBest', title: 'Why Best'}, {id: 'whyLacking', title: 'Why Lacking'},
        {id: 'competitorAhead', title: 'Competitor Ahead'}, {id: 'date', title: 'Date'}
    ],
    append: true
});

// 4. RICH 50 CITIES & NICHES
const CITIES = ["Singapore", "Dubai, UAE", "New York, NY", "London, UK", "Zurich", "Hong Kong", "Tokyo", "Miami, FL", "Doha", "Monaco", "Geneva", "San Francisco", "Paris", "Luxembourg City", "Chicago", "Stockholm", "Sydney", "Toronto", "Frankfurt", "Amsterdam", "Seoul", "Munich", "Oslo", "Abu Dhabi", "Riyadh", "Tel Aviv", "Boston", "Seattle", "Vienna", "Milan", "Barcelona", "Madrid", "Copenhagen", "Vancouver", "Rome", "Brussels", "Dublin", "Austin, TX", "Dallas, TX", "Berlin", "Helsinki", "Auckland", "Bangkok"];
const NICHES = ["Luxury Car Rental", "Dental Clinic", "Private Jet Charter", "Aesthetic Spa", "Real Estate Agency", "Yacht Rental"];

let cityIdx = 0, nicheIdx = 0;

// 5. AI AUDIT LOGIC
async function getDeepAnalysis(biz, city, niche) {
    try {
        const prompt = `Audit for ${biz.title} (${niche}) in ${city}. Why they lack a website. Format: Best: [Text] | Lacking: [Text] | Competitor: [Text]`;
        const chat = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama3-8b-8192",
        });
        const parts = chat.choices[0].message.content.split('|');
        return {
            best: parts[0]?.replace('Best:', '').trim() || "High Potential Service",
            lacking: parts[1]?.replace('Lacking:', '').trim() || "Zero Digital Footprint",
            ahead: parts[2]?.replace('Competitor:', '').trim() || "Rivals have better SEO/Web"
        };
    } catch (e) { return null; }
}

// 6. MAIN SNIPER FUNCTION
async function runWealthSniper() {
    const city = CITIES[cityIdx];
    const niche = NICHES[nicheIdx];
    
    logBot.telegram.sendMessage(MY_ID, `🔍 [SCANNING]: Hunting for ${niche} in ${city}...`);

    try {
        const res = await axios.get('https://serpapi.com/search', {
            params: { engine: "google_maps", q: `${niche} in ${city}`, api_key: process.env.SERPAPI_KEY }
        });

        const results = res.data.local_results || [];
        for (const biz of results) {
            // Strict Filter
            if (!biz.website && biz.phone && biz.rating >= 4.0) {
                
                // Secondary Research (Email)
                const sRes = await axios.get('https://serpapi.com/search', {
                    params: { q: `"${biz.title}" ${city} email contact`, api_key: process.env.SERPAPI_KEY }
                });
                const email = JSON.stringify(sRes.data).match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)?.[0];

                if (email) {
                    const ai = await getDeepAnalysis(biz, city, niche);
                    if (!ai) continue;

                    const lead = {
                        name: biz.title, category: niche, city, phone: biz.phone, email,
                        socials: "Verified", rating: biz.rating, reviews: biz.reviews,
                        whyBest: ai.best, whyLacking: ai.lacking, competitorAhead: ai.ahead,
                        date: new Date().toLocaleDateString()
                    };
                    
                    await csvWriter.writeRecords([lead]);
                    
                    // Approved Lead Bot
                    leadBot.telegram.sendMessage(MY_ID, `✅ **HQ LEAD FOUND**\n🏢 **${biz.title}**\n📧 ${email}\n📍 ${city}\n⭐ ${biz.rating}`);
                    logBot.telegram.sendMessage(MY_ID, `✔️ [LOG]: ${biz.title} added to CSV.`);
                } else {
                    logBot.telegram.sendMessage(MY_ID, `❌ [REJECT]: ${biz.title} (Email Not Found)`);
                }
            } else {
                let r = biz.website ? "Has Website" : (biz.rating < 4.0 ? "Low Rating" : "No Phone");
                logBot.telegram.sendMessage(MY_ID, `⏩ [SKIP]: ${biz.title} (${r})`);
            }
        }
    } catch (e) {
        logBot.telegram.sendMessage(MY_ID, `🚨 [ERROR]: ${e.message}`);
    }

    nicheIdx = (nicheIdx + 1) % NICHES.length;
    if (nicheIdx === 0) cityIdx = (cityIdx + 1) % CITIES.length;
}

// 7. COMMANDS & STARTUP
leadBot.command('download', (ctx) => {
    ctx.replyWithDocument({ source: 'verified_hq_leads.csv' });
});

// System Start
(async () => {
    await leadBot.telegram.sendMessage(MY_ID, "🚀 **Lead Sniper Started!** Overnight hunting begins now.");
    await logBot.telegram.sendMessage(MY_ID, "🛠️ **Log Sniper Started!** System is monitoring...");
    
    // Initial Run & Interval
    runWealthSniper();
    setInterval(runWealthSniper, 180000); // 3 Minute Cycle
})();

leadBot.launch();
logBot.launch();
