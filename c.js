var cacheControl = require('./cache_control');

/* Expiration Logic
 * ----------------
 *  var expires
 *  var cacheControlValue = cacheControl(env.response.headers['cache-control'];
 *  if (cacheControlValue.sharedMaxAge) {
 *    expires = cacheControlValue.sharedMaxAge;
 *  } else if (cacheControlValue.maxAge) {
 *    expires = cacheControl.maxAge;
 *  } else if (env.response.headers['expires']) {
 *    expires = env.response.headers['expires'];
 *  }
 */

/*
 * Cached Data Structure
 * ---------------------
 *  {
 *    headers: {},
 *    body: new Buffer(),
 *    timestamp: Date.now()
 *  }
 */

/* Lifetime Calculation
 * --------------------
 *  - Cache proxy adds Age value
 *  var now = Date.now();
 *  var responseDate = env.response.headers['date'];
 *  var responseAge = env.response.headers['age'];
 *  var receivedAge = Math.max(now - responseDate, responseAge);
 *
 *  var initialAge = receivedAge + (now - env.request.time);
 */

/*
   /*
       * age_value
       *      is the value of Age: header received by the cache with
       *              this response.
       * date_value
       *      is the value of the origin server's Date: header
       * request_time
       *      is the (local) time when the cache made the request
       *              that resulted in this cached response
       * response_time
       *      is the (local) time when the cache received the
       *              response
       * now
       *      is the current (local) time
       *

      apparent_age = max(0, response_time - date_value);
      corrected_received_age = max(apparent_age, age_value);
      response_delay = response_time - request_time;
      corrected_initial_age = corrected_received_age + response_delay;
      resident_time = now - response_time;
      current_age   = corrected_initial_age + resident_time;
*/

/*
 * Request Flow
 * -------------
 *  - Check HTTP Method (GET, HEAD)
 *  - Check request Cache-Control directives & Pragma.
 *    - Check if we have a cache hit.
 *    - Verify Vary headers are the same on a cache hit.
 *  - HIT
 *    - Set Age header.
 *    - Serve.
 *  - MISS
 *    - Send request to backend.
 *    - Block further requests until backend responds. (collapsed forwarding)
 *    - Check if response is cacheable
 *      - Check response status code.
 *      - Check that response doesn't have Set-Cookie header
 *      - Check that response doesn't have Vary: * header.
 *      - Check Expires header.
 *      - Check response Cache-Control directives.
 *      - Check configurable default TTL.
 *    - If response is not cacheable, add URL to "Do Not Block" list. (collapsed forwarding)
 *    - Remove headers.
 *  - Deliver response. 
 */

/* Remove headers: Connection, Keep-Alive, Proxy-Authentication, Proxy-Authorization, TE, Trailers, Transfer-Encoding, Upgrade
 *  
 */

/* Cache Retrieval
 * ---------------
 */

/* Response Status Codes
 * ---------------------
 *  A response received with a status code of 200, 203, 206, 300, 301 or 410 MAY be stored by a cache and used in reply to a subsequent request, subject to the expiration mechanism, unless a cache-control directive prohibits caching. However, a cache that does not support the Range and Content-Range headers MUST NOT cache 206 (Partial Content) responses.

* A response received with any other status code (e.g. status codes 302 and 307) MUST NOT be returned in a reply to a subsequent request unless there are cache-control directives or another header(s) that explicitly allow it. For example, these include the following: an Expires header (section 14.21); a "max-age", "s-maxage", "must- revalidate", "proxy-revalidate", "public" or "private" cache-control directive (section 14.9).
*/
