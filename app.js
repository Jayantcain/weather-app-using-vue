const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const port = 8084;
const app = express();
let publicPath = path.resolve(__dirname, 'public');
app.use(express.static(publicPath));

function sum(arr) {
    return arr.reduce((prev, curr) => prev + curr, 0);
}

function avg(arr) {
    return sum(arr) / arr.length;
}

app.get('/data/:cityName', async (req, res) => {
    // Define some variables we will use to form
    // the URL for our HTTP request to Openweathermap
    // Note: 'owm' is short for Openweathermap
    const cityName = req.params.cityName;
    const owmApiKey = '90294b973f8b66f52cda34c25c4ea4ac';
    const owmHost = 'http://api.openweathermap.org';

    // This is the response we will send to client-side app.
    let resJSON = { 'errored': false };

    // Find out coordinates of the city using OWMs
    // geolocation API.
    const owmGeoApiEndpoint = `/geo/1.0/direct?q=${cityName}&limit=5&appid=${owmApiKey}`;
    const owmGeoUrl = owmHost + owmGeoApiEndpoint;
    const coordinates = await fetch(owmGeoUrl).then(async response => {
        const data = await response.json();
        if (!response.ok) {
            return Promise.reject("Cannot fetch coordinates.");
        }
        // Extract latitude and longitude from response.
        const latitude = data[0]['lat'];
        const longitude = data[0]['lon'];
        return [latitude, longitude];
    }).catch(error => {
        console.log(error);
        return null;
    });
    if (coordinates === null) {
        // If we are not able to get the coordinates,
        // send back a response to client-side indicating
        // that an error has occurred.
        resJSON['errored'] = true;
        return res.json(resJSON);
    }

    // Find out forecast using OWMs forecast API
    const owmWeatherEndpoint = `/data/2.5/forecast?lat=${coordinates[0]}&lon=${coordinates[1]}&appid=${owmApiKey}&units=metric`;
    const owmWeatherUrl = owmHost + owmWeatherEndpoint;
    const forecast = await fetch(owmWeatherUrl).then(async response => {
        const data = await response.json();
        if (!response.ok) {
            return Promise.reject("Cannot fetch weather data.");
        }
        let forecast = {};
        // Create a dictionary 'forecast' with a key
        // for each date, and arrays for temperature,
        // wind speed and rainfall. This is because
        // OWM sends 3-hourly data, so for each day
        // we expect to have 8 data points.
        data['list'].forEach(datapoint => {
            date = datapoint['dt_txt'].substring(0, 10);
            let windSpeed = datapoint['wind']['speed'];
            let temperature = datapoint['main']['temp'];
            let rainfall = datapoint['rain'] ? datapoint['rain']['3h'] : 0;
            if (date in forecast) {
                forecast[date]['windSpeed'].push(windSpeed);
                forecast[date]['temperature'].push(temperature);
                forecast[date]['rainfall'].push(rainfall);
            } else {
                forecast[date] = {
                    'windSpeed': [windSpeed],
                    'temperature': [temperature],
                    'rainfall': [rainfall],
                }
            }
        });
        return forecast;
    }).catch(error => {
        console.log(error);
        return null;
    });
    if (forecast === null) {
        // If error occurred while fetching weather
        // data, send response to client-side app
        // indicating the same.
        resJSON['errored'] = true;
        return res.json(resJSON);
    }

    // Find air pollution using OWMs pollution API.
    const owmAirPollutionEndpoint = `/data/2.5/air_pollution/forecast?lat=${coordinates[0]}&lon=${coordinates[1]}&appid=${owmApiKey}`;
    const owmAirPollutionUrl = owmHost + owmAirPollutionEndpoint;
    const pollutionData = await fetch(owmAirPollutionUrl).then(async response => {
        const data = await response.json();
        if (!response.ok) {
            return Promise.reject("Cannot fetch air pollution data.");
        }
        // The 'isPolluted' flag should be set if
        // PM2.5 levels exceed 10 at any given point
        // of time over the next 5 days.
        let isPolluted = false;
        // The 'aqi' will be an average of the Air
        // Quality Index (AQI) over the next 5 days.
        let aqi = 0;
        let aqi_n = 0;
        data['list'].forEach(datapoint => {
            if (datapoint['components']['pm2_5'] >= 10) {
                isPolluted = true;
            }
            aqi += datapoint['main']['aqi'];
            aqi_n++;
        });
        aqi /= aqi_n;
        return {
            'isPolluted': isPolluted,
            'aqi': aqi,
        };
    }).catch(error => {
        console.log(error);
        return null;
    });
    if (pollutionData === null) {
        // If an error occurred while fetching
        // pollution data from OWM, send back
        // a response to the client-side, indicating
        // the same.
        resJSON['errored'] = true;
        return res.json(resJSON);
    }
    const isPolluted = pollutionData['isPolluted'];
    const aqi = pollutionData['aqi'];

    // Check if temperature is cold/mild/hot and whether it will rain
    let isCold = false;
    let isMild = false;
    let isHot = false;
    let mightRain = false;
    for (const [date, data] of Object.entries(forecast)) {
        if (avg(data['temperature']) < 12) {
            isCold = true;
        } else if (avg(data['temperature']) > 24) {
            isHot = true;
        } else {
            isMild = true;
        }
        if (sum(data['rainfall']) > 0) {
            mightRain = true;
        }
    }

    // Create packing list
    let packingList = []
    if (isCold) {
        packingList.push('Cold-weather clothes')
    }
    if (isMild) {
        packingList.push('Mild-weather clothes')
    }
    if (isHot) {
        packingList.push('Hot-weather clothes')
    }
    if (isPolluted) {
        packingList.push('Mask')
    }
    if (mightRain) {
        packingList.push('Umbrella')
    }

    // Form a summary of the forecast. At this point in
    // the code execution, the forecast for each day
    // contains an array of values for temperature,
    // wind speed and rainfall respectively. We want
    // a 'summary', i.e., one value for each day.
    // Temperature is averaged.
    // Wind speed is averaged.
    // Rainfall is added up, since total rainfall in a day
    // should be sum of rainfall (in mm) at individual
    // points of time in a day.
    let forecastSummary = {}
    for (const [date, data] of Object.entries(forecast)) {
        forecastSummary[date] = {
            'windSpeed': avg(data['windSpeed']),
            'temperature': avg(data['temperature']),
            'rainfall': sum(data['rainfall']),
        };
    }

    // Return packing list, forecast and AQI as response
    resJSON['packingList'] = packingList;
    resJSON['forecastSummary'] = forecastSummary;
    resJSON['aqi'] = aqi;
    return res.json(resJSON);
});

app.listen(port, () => console.log(`Server now listening on port ${port}`))