const NAVER_FLIGHT_API = 'https://flight-api.naver.com/flight/international/searchFlights';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function buildPayload(dep, dest, depDate, retDate) {
  return {
    adultCount: 1,
    childCount: 0,
    infantCount: 0,
    device: 'pc',
    isNonstop: true,
    seatClass: 'Y',
    tripType: 'RT',
    itineraries: [
      { departureLocationCode: dep, departureLocationType: 'airport', arrivalLocationCode: dest, arrivalLocationType: 'airport', departureDate: depDate },
      { departureLocationCode: dest, departureLocationType: 'airport', arrivalLocationCode: dep, arrivalLocationType: 'airport', departureDate: retDate }
    ],
    openReturnDays: 0,
    flightFilter: {
      filter: {
        airlines: [],
        departureAirports: [[dep], []],
        arrivalAirports: [[], [dep]],
        departureTime: [],
        fareTypes: [],
        flightDurationSeconds: [],
        hasCardBenefit: true,
        isIndividual: false,
        isLowCarbonEmission: false,
        isSameAirlines: false,
        isSameDepArrAirport: true,
        isTravelClub: false,
        minFare: {},
        viaCount: [],
        selectedItineraries: []
      },
      limit: 200,
      skip: 0,
      sort: { adultMinFare: 1 }
    },
    initialRequest: true
  };
}

function parseLowestFare(text) {
  var lines = text.split('\n');
  var lastValid = null;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.indexOf('data: ') === 0) {
      try {
        var data = JSON.parse(line.slice(6));
        if (data.itineraries && data.itineraries.length && data.fareMappings && data.fareMappings.length) {
          lastValid = data;
        }
      } catch (e) { /* ignore malformed SSE chunk */ }
    }
  }
  if (!lastValid) return null;

  var lowest = null;
  if (lastValid.status && lastValid.status.lowestFare) {
    var lf = lastValid.status.lowestFare;
    lowest = (lf.direct != null) ? lf.direct : lf.a01;
  }
  if (lowest == null && lastValid.status && lastValid.status.priceRange) {
    lowest = lastValid.status.priceRange.min;
  }
  if (lowest == null && lastValid.fareMappings) {
    lastValid.fareMappings.forEach(function (m) {
      (m.fares || []).forEach(function (f) {
        if (f.adult && typeof f.adult.totalFare === 'number') {
          if (lowest == null || f.adult.totalFare < lowest) lowest = f.adult.totalFare;
        }
      });
    });
  }
  return lowest;
}

module.exports = async (req, res) => {
  try{
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    var q = req.query || {};
    var dep = q.dep, dest = q.dest, depDate = q.depDate, retDate = q.retDate;

    if (!dep || !dest || !depDate || !retDate) {
      res.status(400).json({ price: null, reason: 'missing_params' });
      return;
    }

    var controller = new AbortController();
    var timeoutId = setTimeout(function () { controller.abort(); }, 9000);

    try {
      var response = await fetch(NAVER_FLIGHT_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'User-Agent': USER_AGENT,
          'Referer': 'https://flight.naver.com/',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify(buildPayload(dep, dest, depDate, retDate)),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        res.status(200).json({ price: null, reason: 'naver_status_' + response.status });
        return;
      }

      var text = await response.text();
      var price = parseLowestFare(text);
      res.status(200).json({ price: price, reason: price == null ? 'no_data' : null, rawLength: text.length });
    } catch (innerErr) {
      clearTimeout(timeoutId);
      res.status(200).json({
        price: null,
        reason: (innerErr && innerErr.name === 'AbortError') ? 'timeout' : 'fetch_error',
        message: String(innerErr && innerErr.message)
      });
    }
  } catch (outerErr) {
    res.status(200).json({
      price: null,
      reason: 'crash',
      message: String(outerErr && outerErr.message),
      stack: String(outerErr && outerErr.stack || '').split('\n').slice(0, 4).join(' | ')
    });
  }
};
