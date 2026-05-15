const dataPath = "data/ai_workforce_displacement_global_2020_2026.csv";

let allData = [];
let filteredData = [];
let worldGeoData = null;

Promise.all([
    d3.csv(dataPath),
    d3.json("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson")
    ]).then(([data, geoData]) => {
    worldGeoData = geoData;
    allData = data.map(d => ({
        country: d.country,
        iso3: d.iso3_code,
        region: d.region,
        year: +d.year,
        quarter: +d.quarter,
        quarterLabel: d.quarter_label,
        industry: d.industry_sector,
        automationRisk: +d.sector_automation_risk_score,
        aiAdoption: +d.ai_adoption_index,
        displaced: +d.pct_sector_workforce_displaced,
        newRoles: +d.pct_sector_workforce_new_roles_created,
        netChange: +d.net_workforce_change_pct,
        wagePremium: +d.ai_skill_wage_premium_pct,
        toolAdoption: +d.ai_tool_adoption_pct,
        policyScore: +d.govt_ai_policy_score_1_to_10
    }));

    filteredData = allData;

    initFilters();
    updateDashboard();

    console.log("Loaded data:", allData);
});

function initFilters() {
    const years = [...new Set(allData.map(d => d.year))].sort();
    const regions = [...new Set(allData.map(d => d.region))].sort();
    const countries = [...new Set(allData.map(d => d.country))].sort();
    const industries = [...new Set(allData.map(d => d.industry))].sort();

    fillSelect("#yearFilter", years);
    fillSelect("#regionFilter", regions);
    fillSelect("#countryFilter", countries);
    fillSelect("#industryFilter", industries);

    d3.select("#yearFilter").on("change", applyFilters);
    d3.select("#regionFilter").on("change", applyFilters);
    d3.select("#countryFilter").on("change", applyFilters);
    d3.select("#industryFilter").on("change", applyFilters);

    d3.select("#resetFilters").on("click", () => {
        d3.select("#yearFilter").property("value", "all");
        d3.select("#regionFilter").property("value", "all");
        d3.select("#countryFilter").property("value", "all");
        d3.select("#industryFilter").property("value", "all");

        applyFilters();
    });
}

function fillSelect(selector, values) {
    const select = d3.select(selector);

    select.selectAll("option.data-option")
        .data(values)
        .enter()
        .append("option")
        .attr("class", "data-option")
        .attr("value", d => d)
        .text(d => d);
}

function applyFilters() {
    const selectedYear = d3.select("#yearFilter").property("value");
    const selectedRegion = d3.select("#regionFilter").property("value");
    const selectedCountry = d3.select("#countryFilter").property("value");
    const selectedIndustry = d3.select("#industryFilter").property("value");

    filteredData = allData.filter(d => {
        const yearMatch = selectedYear === "all" || d.year === +selectedYear;
        const regionMatch = selectedRegion === "all" || d.region === selectedRegion;
        const countryMatch = selectedCountry === "all" || d.country === selectedCountry;
        const industryMatch = selectedIndustry === "all" || d.industry === selectedIndustry;

        return yearMatch && regionMatch && industryMatch && countryMatch;
    });

    updateDashboard();
}

function updateDashboard() {
    console.log("Filtered data:", filteredData);

    // Pozovi:
    updateKPI();
    drawLineChart();
    drawBubbleChart();
    drawMap();
    drawDonutChart();
}

function updateKPI() {
    if (filteredData.length === 0) {
        d3.select("#kpiAdoption").text("-");
        d3.select("#kpiDisplacement").text("-");
        d3.select("#kpiIndustry").text("-");
        d3.select("#kpiWage").text("-");
        return;
    }

    const avgAdoption = d3.mean(filteredData, d => d.aiAdoption);
    const avgDisplacement = d3.mean(filteredData, d => d.displaced);
    const avgWage = d3.mean(filteredData, d => d.wagePremium);

    const industryRisk = d3.rollups(
        filteredData,
        v => d3.mean(v, d => d.automationRisk),
        d => d.industry
    );

    const highestRiskIndustry = industryRisk.sort((a, b) => b[1] - a[1])[0];

    d3.select("#kpiAdoption").text((avgAdoption * 100).toFixed(0) + "%");
    d3.select("#kpiDisplacement").text(avgDisplacement.toFixed(1) + "%");
    d3.select("#kpiIndustry").text(highestRiskIndustry[0]);
    d3.select("#kpiWage").text((avgWage * 100).toFixed(0) + "%");
}

function drawLineChart() {
    d3.select("#lineChart").selectAll("*").remove();

    const margin = { top: 40, right: 40, bottom: 60, left: 70 };
    const width = 1000 - margin.left - margin.right;
    const height = 420 - margin.top - margin.bottom;

    const svg = d3.select("#lineChart")
        .append("svg")
        .attr("viewBox", `0 0 1000 420`)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const yearlyData = d3.rollups(
        filteredData,
        v => ({
            aiAdoption: d3.mean(v, d => d.aiAdoption) * 100,
            displacement: d3.mean(v, d => d.displaced) * 100
        }),
        d => d.year
    ).map(([year, values]) => ({
        year,
        aiAdoption: values.aiAdoption,
        displacement: values.displacement
    })).sort((a, b) => a.year - b.year);

    const x = d3.scalePoint()
        .domain(yearlyData.map(d => d.year))
        .range([0, width])
        .padding(0.5);

    const y = d3.scaleLinear()
        .domain([
            0,
            d3.max(yearlyData, d => Math.max(d.aiAdoption, d.displacement)) * 1.2
        ])
        .range([height, 0]);

    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .attr("class", "axis")
        .call(d3.axisBottom(x));

    svg.append("g")
        .attr("class", "axis")
        .call(d3.axisLeft(y));

    const aiLine = d3.line()
        .x(d => x(d.year))
        .y(d => y(d.aiAdoption))
        .curve(d3.curveMonotoneX);

    const displacementLine = d3.line()
        .x(d => x(d.year))
        .y(d => y(d.displacement))
        .curve(d3.curveMonotoneX);

    drawAnimatedPath(svg, yearlyData, aiLine, "#00F5FF", "AI Adoption");
    drawAnimatedPath(svg, yearlyData, displacementLine, "#FF4D6D", "Displacement");

    drawLineDots(svg, yearlyData, x, y);
    drawLegend(svg);
}

function drawAnimatedPath(svg, data, lineGenerator, color) {
    const path = svg.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", 4)
        .attr("filter", "drop-shadow(0 0 8px " + color + ")")
        .attr("d", lineGenerator);

    const length = path.node().getTotalLength();

    path
        .attr("stroke-dasharray", length)
        .attr("stroke-dashoffset", length)
        .transition()
        .duration(1200)
        .ease(d3.easeCubicOut)
        .attr("stroke-dashoffset", 0);
}

function drawLineDots(svg, data, x, y) {
    const tooltip = d3.select("body")
        .selectAll(".tooltip")
        .data([null])
        .join("div")
        .attr("class", "tooltip");

    svg.selectAll(".dot-ai")
        .data(data)
        .enter()
        .append("circle")
        .attr("class", "dot-ai")
        .attr("cx", d => x(d.year))
        .attr("cy", d => y(d.aiAdoption))
        .attr("r", 6)
        .attr("fill", "#00F5FF")
        .on("mouseover", function(event, d) {
            d3.select(this).attr("r", 10);

            tooltip
                .style("opacity", 1)
                .html(`
                    <strong>${d.year}</strong><br>
                    AI Adoption: ${d.aiAdoption.toFixed(1)}%
                `)
                .style("left", event.pageX + 16 + "px")
                .style("top", event.pageY - 20 + "px");
        })
        .on("mouseout", function() {
            d3.select(this).attr("r", 6);
            tooltip.style("opacity", 0);
        });

    svg.selectAll(".dot-displacement")
        .data(data)
        .enter()
        .append("circle")
        .attr("class", "dot-displacement")
        .attr("cx", d => x(d.year))
        .attr("cy", d => y(d.displacement))
        .attr("r", 6)
        .attr("fill", "#FF4D6D")
        .on("mouseover", function(event, d) {
            d3.select(this).attr("r", 10);

            tooltip
                .style("opacity", 1)
                .html(`
                    <strong>${d.year}</strong><br>
                    Displacement: ${d.displacement.toFixed(1)}%
                `)
                .style("left", event.pageX + 16 + "px")
                .style("top", event.pageY - 20 + "px");
        })
        .on("mouseout", function() {
            d3.select(this).attr("r", 6);
            tooltip.style("opacity", 0);
        });
}

function drawLegend(svg) {
    const legend = svg.append("g")
        .attr("transform", "translate(680, 10)");

    legend.append("circle")
        .attr("r", 6)
        .attr("fill", "#00F5FF");

    legend.append("text")
        .attr("x", 14)
        .attr("y", 5)
        .attr("fill", "#D1D5DB")
        .text("AI Adoption");

    legend.append("circle")
        .attr("cy", 28)
        .attr("r", 6)
        .attr("fill", "#FF4D6D");

    legend.append("text")
        .attr("x", 14)
        .attr("y", 33)
        .attr("fill", "#D1D5DB")
        .text("Displacement");
}

function drawBubbleChart() {
    d3.select("#bubbleChart").selectAll("*").remove();

    const width = 1000;
    const height = 560;
    const padding = 95;

    const svg = d3.select("#bubbleChart")
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`);

    const industryData = d3.rollups(
        filteredData,
        v => ({
            displacement: d3.mean(v, d => d.displaced) * 100,
            automationRisk: d3.mean(v, d => d.automationRisk) * 100,
            aiAdoption: d3.mean(v, d => d.aiAdoption) * 100,
            toolAdoption: d3.mean(v, d => d.toolAdoption) * 100
        }),
        d => d.industry
    ).map(([industry, values]) => ({
        industry,
        ...values
    }));

    const radius = d3.scaleSqrt()
        .domain([0, d3.max(industryData, d => d.displacement)])
        .range([28, 78]);

    const color = d3.scaleLinear()
        .domain(d3.extent(industryData, d => d.automationRisk))
        .range(["#00F5FF", "#FF4D6D"]);

    const tooltip = d3.select("body")
        .selectAll(".tooltip")
        .data([null])
        .join("div")
        .attr("class", "tooltip");

    industryData.forEach(d => {
        d.r = radius(d.displacement);
        d.x = width / 2 + (Math.random() - 0.5) * 200;
        d.y = height / 2 + (Math.random() - 0.5) * 120;
    });

    const simulation = d3.forceSimulation(industryData)
        .force("center", d3.forceCenter(width / 2, height / 2 + 30))
        .force("x", d3.forceX(width / 2).strength(0.08))
        .force("y", d3.forceY(height / 2 + 30).strength(0.08))
        .force("charge", d3.forceManyBody().strength(4))
        .force("collision", d3.forceCollide(d => d.r + 8))
        .on("tick", ticked);

    const bubbles = svg.selectAll(".bubble")
        .data(industryData)
        .enter()
        .append("g")
        .attr("class", "bubble");

    bubbles.append("circle")
        .attr("r", 0)
        .attr("fill", d => color(d.automationRisk))
        .attr("opacity", 0.85)
        .attr("stroke", "rgba(255,255,255,0.55)")
        .attr("stroke-width", 1)
        .attr("filter", "drop-shadow(0 0 12px rgba(0,245,255,0.35))")
        .transition()
        .duration(900)
        .attr("r", d => d.r);

    bubbles.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .attr("fill", "#ffffff")
        .attr("font-size", "13px")
        .attr("font-weight", "600")
        .attr("pointer-events", "none")
        .text(d => d.industry.length > 16 ? d.industry.slice(0, 16) + "…" : d.industry);

    bubbles
        .on("mouseover", function(event, d) {
            d3.select(this).select("circle")
                .transition()
                .duration(200)
                .attr("stroke-width", 3)
                .attr("opacity", 1);

            tooltip
                .style("opacity", 1)
                .html(`
                    <strong>${d.industry}</strong><br>
                    Displacement: ${d.displacement.toFixed(1)}%<br>
                    Automation risk: ${d.automationRisk.toFixed(1)}%<br>
                    AI adoption: ${d.aiAdoption.toFixed(1)}%<br>
                    Tool adoption: ${d.toolAdoption.toFixed(1)}%
                `)
                .style("left", event.pageX + 16 + "px")
                .style("top", event.pageY - 20 + "px");
        })
        .on("mousemove", function(event) {
            tooltip
                .style("left", event.pageX + 16 + "px")
                .style("top", event.pageY - 20 + "px");
        })
        .on("mouseout", function() {
            d3.select(this).select("circle")
                .transition()
                .duration(200)
                .attr("stroke-width", 1)
                .attr("opacity", 0.85);

            tooltip.style("opacity", 0);
        });

    function ticked() {
        industryData.forEach(d => {
            d.x = Math.max(d.r + padding, Math.min(width - d.r - padding, d.x));
            d.y = Math.max(d.r + padding, Math.min(height - d.r - padding, d.y));
        });

        bubbles.attr("transform", d => `translate(${d.x},${d.y})`);
    }
}

function drawMap() {
    d3.select("#worldMap").selectAll("*").remove();

    if (!worldGeoData) return;

    const width = 1000;
    const height = 560;

    const svg = d3.select("#worldMap")
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`);

    const projection = d3.geoNaturalEarth1()
        .scale(180)
        .translate([width / 2, height / 2]);

    const path = d3.geoPath().projection(projection);

    const countryData = d3.rollups(
        filteredData,
        v => ({
            aiAdoption: d3.mean(v, d => d.aiAdoption) * 100,
            displacement: d3.mean(v, d => d.displaced) * 100,
            automationRisk: d3.mean(v, d => d.automationRisk) * 100,
            country: v[0].country,
            region: v[0].region
        }),
        d => d.iso3
    );

    const dataMap = new Map(countryData);

    const values = countryData.map(d => d[1].aiAdoption);

    const color = d3.scaleSequential()
        .domain([d3.min(values), d3.max(values)])
        .interpolator(d3.interpolateCool);

    const tooltip = d3.select("body")
        .selectAll(".tooltip")
        .data([null])
        .join("div")
        .attr("class", "tooltip");

    svg.append("g")
        .selectAll("path")
        .data(worldGeoData.features)
        .enter()
        .append("path")
        .attr("d", path)
        .attr("class", "country")
        .attr("fill", d => {
            const iso3 =
                d.properties.ADM0_A3 ||
                d.properties.ISO_A3 ||
                d.properties.SOV_A3;

            const data = dataMap.get(iso3);

            return data ? color(data.aiAdoption) : "rgba(255,255,255,0.06)";
        })
        .attr("stroke", "rgba(255,255,255,0.18)")
        .attr("stroke-width", 0.6)
        .on("mouseover", function(event, d) {
            const iso3 =
                d.properties.ADM0_A3 ||
                d.properties.ISO_A3 ||
                d.properties.SOV_A3;

            const data = dataMap.get(iso3);

            d3.select(this)
                .attr("stroke", "#00F5FF")
                .attr("stroke-width", 1.8)
                .attr("filter", "drop-shadow(0 0 8px #00F5FF)");

            if (data) {
                tooltip
                    .style("opacity", 1)
                    .html(`
                        <strong>${data.country}</strong><br>
                        Region: ${data.region}<br>
                        AI adoption: ${data.aiAdoption.toFixed(1)}%<br>
                        Displacement: ${data.displacement.toFixed(1)}%<br>
                        Automation risk: ${data.automationRisk.toFixed(1)}%
                    `)
                    .style("left", event.pageX + 16 + "px")
                    .style("top", event.pageY - 20 + "px");
            } else {
                tooltip
                    .style("opacity", 1)
                    .html(`
                        <strong>${d.properties.NAME}</strong><br>
                        No data available
                    `)
                    .style("left", event.pageX + 16 + "px")
                    .style("top", event.pageY - 20 + "px");
            }
        })
        .on("mousemove", function(event) {
            tooltip
                .style("left", event.pageX + 16 + "px")
                .style("top", event.pageY - 20 + "px");
        })
        .on("mouseout", function() {
            d3.select(this)
                .attr("stroke", "rgba(255,255,255,0.18)")
                .attr("stroke-width", 0.6)
                .attr("filter", null);

            tooltip.style("opacity", 0);
        });

    drawMapLegend(svg, color, width, height);
}

function drawMapLegend(svg, color, width, height) {
    const legendWidth = 240;
    const legendHeight = 12;

    const defs = svg.append("defs");

    const gradient = defs.append("linearGradient")
        .attr("id", "map-gradient")
        .attr("x1", "0%")
        .attr("x2", "100%");

    const stops = d3.range(0, 1.01, 0.1);

    stops.forEach(stop => {
        gradient.append("stop")
            .attr("offset", `${stop * 100}%`)
            .attr("stop-color", color(
                color.domain()[0] +
                stop * (color.domain()[1] - color.domain()[0])
            ));
    });

    const legend = svg.append("g")
        .attr("transform", `translate(${width - legendWidth - 60}, ${height - 60})`);

    legend.append("rect")
        .attr("width", legendWidth)
        .attr("height", legendHeight)
        .attr("rx", 8)
        .attr("fill", "url(#map-gradient)");

    legend.append("text")
        .attr("x", 0)
        .attr("y", -8)
        .attr("fill", "#D1D5DB")
        .attr("font-size", "12px")
        .text("Lower AI adoption");

    legend.append("text")
        .attr("x", legendWidth)
        .attr("y", -8)
        .attr("text-anchor", "end")
        .attr("fill", "#D1D5DB")
        .attr("font-size", "12px")
        .text("Higher AI adoption");
}

function drawDonutChart() {
    d3.select("#donutChart").selectAll("*").remove();

    if (filteredData.length === 0) return;

    const width = 1000;
    const height = 520;

    const svg = d3.select("#donutChart")
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`);

    const chartGroup = svg.append("g")
        .attr("transform", `translate(${width / 2 - 80}, ${height / 2})`);

    const avgDisplaced = d3.mean(filteredData, d => d.displaced) * 100;
    const avgNewRoles = d3.mean(filteredData, d => d.newRoles) * 100;
    const stableWorkforce = Math.max(0, 100 - avgDisplaced - avgNewRoles);

    const data = [
        { label: "Stable Workforce", value: stableWorkforce, color: "#7A5CFF" },
        { label: "Displaced Jobs", value: avgDisplaced, color: "#FF4D6D" },
        { label: "New AI Roles", value: avgNewRoles, color: "#00F5FF" }
    ];

    const radius = 170;

    const pie = d3.pie()
        .sort(null)
        .value(d => d.value);

    const arc = d3.arc()
        .innerRadius(95)
        .outerRadius(radius);

    const hoverArc = d3.arc()
        .innerRadius(95)
        .outerRadius(radius + 12);

    const tooltip = d3.select("body")
        .selectAll(".tooltip")
        .data([null])
        .join("div")
        .attr("class", "tooltip");

    const arcGroups = chartGroup.selectAll(".arc-group")
        .data(pie(data))
        .enter()
        .append("g")
        .attr("class", "arc-group");

    arcGroups.append("path")
        .attr("class", "donut-segment")
        .attr("fill", d => d.data.color)
        .attr("stroke", "rgba(255,255,255,0.08)")
        .attr("stroke-width", 1)
        .attr("filter", d => `drop-shadow(0 0 12px ${d.data.color})`)
        .transition()
        .duration(1200)
        .attrTween("d", function(d) {
            const interpolate = d3.interpolate(
                { startAngle: 0, endAngle: 0 },
                d
            );

            return function(t) {
                return arc(interpolate(t));
            };
        });

    arcGroups.append("path")
        .attr("class", "donut-hover-area")
        .attr("d", arc)
        .attr("fill", "transparent")
        .style("cursor", "pointer")
        .on("mouseover", function(event, d) {
            d3.select(this.parentNode)
                .select(".donut-segment")
                .transition()
                .duration(200)
                .attr("d", hoverArc);

            tooltip
                .style("opacity", 1)
                .html(`
                    <strong>${d.data.label}</strong><br>
                    ${d.data.value.toFixed(1)}%
                `)
                .style("left", event.pageX + 16 + "px")
                .style("top", event.pageY - 20 + "px");
        })
        .on("mousemove", function(event) {
            tooltip
                .style("left", event.pageX + 16 + "px")
                .style("top", event.pageY - 20 + "px");
        })
        .on("mouseout", function() {
            d3.select(this.parentNode)
                .select(".donut-segment")
                .transition()
                .duration(200)
                .attr("d", arc);

            tooltip.style("opacity", 0);
        });

    chartGroup.append("text")
        .attr("text-anchor", "middle")
        .attr("y", -10)
        .attr("fill", "#ffffff")
        .attr("font-size", "2rem")
        .attr("font-weight", "700")
        .text("AI");

    chartGroup.append("text")
        .attr("text-anchor", "middle")
        .attr("y", 24)
        .attr("fill", "#9CA3AF")
        .attr("font-size", "1rem")
        .text("Workforce Impact");

    const legend = svg.append("g")
        .attr("transform", `translate(720, 185)`);

    data.forEach((item, index) => {
        const row = legend.append("g")
            .attr("transform", `translate(0, ${index * 42})`);

        row.append("circle")
            .attr("r", 8)
            .attr("fill", item.color);

        row.append("text")
            .attr("x", 18)
            .attr("y", 5)
            .attr("fill", "#D1D5DB")
            .text(`${item.label} (${item.value.toFixed(1)}%)`);
    });
}

// Uređivanje izgleda
const cursorGlow = document.querySelector(".cursor-glow");

document.addEventListener("mousemove", event => {
    if (!cursorGlow) return;

    cursorGlow.style.left = event.clientX + "px";
    cursorGlow.style.top = event.clientY + "px";
}); 