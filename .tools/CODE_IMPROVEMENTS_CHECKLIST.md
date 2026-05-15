# SparkDate Code Improvements & Optimizations
## Tasks for Claude Code to Complete (While You're Away)

**Priority Level:** All tasks are launch-critical or high-value improvements  
**Estimated Time:** 2-4 hours depending on which tasks are completed

---

## TIER 1: CRITICAL (Must Complete)

### T1.1: Verify & Fix Gender Field Consistency
**Status:** Deployed in signup.html  
**Task:** Verify gender field is consistent across all user-facing forms

**Checklist:**
- [x] signup.html: Gender = Woman/Man only ✓
- [ ] event.html: Check gender field displays correctly on event registration
- [ ] account.html: Verify gender displays as "Woman" or "Man" (not "woman"/"man")
- [ ] Firestore: Check existing user documents - any have "non-binary" or "other"?
  - If yes, add migration: lowercase all gender values to match schema
- [ ] Create test: Try to create account with all gender options, confirm only W/M work

**Files to check:**
```
public/event.html (search for "identify" or "gender")
public/account.html (verify display field)
```

---

### T1.2: Fix subscriptionId Field Name (Critical for Upgrades)
**Status:** Fixed in upgrade-subscription.js, but need verification across codebase

**Task:** Ensure field name is consistent everywhere

**Checklist:**
- [x] upgrade-subscription.js uses `subscriptionId` ✓
- [ ] account.html references correct field
- [ ] account.html doesn't reference old `stripeSubscriptionId`
- [ ] account.html searches for `subscriptionId` in Firestore query
- [ ] Test: Create new user, verify `subscriptionId` is populated after signup
- [ ] Test: Log in, try to upgrade tier, confirm API receives correct field

**Terminal commands to run:**
```bash
# Search for all references to ensure consistency
grep -r "stripeSubscriptionId" public/ api/
grep -r "subscriptionId" public/ api/

# Should see stripeSubscriptionId NOWHERE
# Should see subscriptionId only in:
# - api/upgrade-subscription.js
# - api/cancel-subscription.js  
# - public/account.html
```

---

### T1.3: Email-Already-Exists Redirect (Verify Deployment)
**Status:** Code deployed in signup.html

**Task:** Test the redirect flow end-to-end

**Checklist:**
- [ ] Test: Signup with email that already exists
- [ ] Verify: Error message shows correctly
- [ ] Verify: Redirects to /account after 2 seconds
- [ ] Verify: sessionStorage pre-fills email field
- [ ] Verify: "Welcome back! Sign in to continue." message appears
- [ ] Test on mobile: Does it still redirect properly?

---

## TIER 2: HIGH PRIORITY (Should Complete)

### T2.1: Add Error Handling to API Endpoints
**Status:** Partial - most have try/catch, but could be more comprehensive

**Task:** Ensure all API endpoints have proper error handling + logging

**Files:**
```
api/create-subscription.js
api/cancel-subscription.js
api/upgrade-subscription.js
api/purchase-ticket.js
api/stripe-webhook.js
```

**Checklist for each file:**
- [ ] Has try/catch block
- [ ] Returns proper HTTP status codes (200, 400, 500, 402 for payment errors)
- [ ] Error messages are user-friendly (not raw JSON from Stripe)
- [ ] Logs errors to console (for Vercel function logs)
- [ ] Handles Stripe-specific errors (StripeCardError, InvalidRequestError)
- [ ] Has validation for required fields at top

**Example improvement:**
```javascript
// BAD
catch (error) {
    return res.status(500).json({ error: error });
}

// GOOD
catch (error) {
    console.error('Subscription creation failed:', error.message);
    
    if (error.type === 'StripeCardError') {
        return res.status(402).json({
            error: 'Payment failed',
            message: error.message
        });
    }
    
    if (error.code === 'auth/email-already-in-use') {
        return res.status(409).json({
            error: 'Account exists',
            message: 'This email is already registered. Please sign in.'
        });
    }
    
    return res.status(500).json({
        error: 'Unexpected error',
        message: 'Please try again or contact support'
    });
}
```

---

### T2.2: Add Input Validation to Forms
**Status:** Partial - has HTML5 validation, missing JS validation

**Task:** Add client-side validation before API calls

**Files:**
```
public/signup.html
public/event.html
```

**Checklist:**
- [ ] Signup form validates email format (not just HTML5)
- [ ] Signup form validates password min length (8 chars) with JS feedback
- [ ] Signup form validates age is numeric and 18+
- [ ] Signup form validates card details before sending to Stripe
- [ ] Event booking form validates quantity is > 0
- [ ] All forms show real-time feedback (red border if invalid)
- [ ] Forms disable submit button until all fields valid

**Example for signup.html:**
```javascript
// Add before Stripe call
function validateSignupForm() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const age = parseInt(document.getElementById('age').value);
    
    if (!email.includes('@')) {
        showError('Please enter a valid email');
        return false;
    }
    
    if (password.length < 8) {
        showError('Password must be at least 8 characters');
        return false;
    }
    
    if (age < 18 || age > 120) {
        showError('Age must be between 18 and 120');
        return false;
    }
    
    return true;
}

// Call this before payment
document.getElementById('signupForm').addEventListener('submit', (e) => {
    if (!validateSignupForm()) {
        e.preventDefault();
        return;
    }
    // ... continue with payment
});
```

---

### T2.3: Improve Error Messages for Users
**Status:** Current messages are too technical

**Task:** Replace API errors with user-friendly messages

**Search for these patterns:**
```
error.message (raw Stripe errors)
JSON.stringify(error)
throw new Error
```

**Improvement template:**
```javascript
// BEFORE
errorMsg.textContent = 'Error: ' + err.message;

// AFTER (user-friendly)
const userMessages = {
    'auth/email-already-in-use': 'This email is already registered. Please sign in instead.',
    'auth/weak-password': 'Password must be at least 8 characters.',
    'StripeCardError': 'Your card was declined. Please check your details.',
    'auth/network-request-failed': 'Network error. Please check your connection.',
};

errorMsg.textContent = userMessages[err.code] || 'Something went wrong. Please try again.';
```

---

### T2.4: Add Loading State Indicators
**Status:** Partial - signup has loading spinner, others missing

**Task:** Add visual feedback during API calls

**Files needing improvement:**
```
public/account.html (tier upgrade - currently has opacity change)
public/event.html (ticket purchase)
```

**Checklist:**
- [ ] Tier upgrade: Show "Updating..." + spinner, disable buttons during request
- [ ] Event booking: Show "Reserving ticket..." + spinner
- [ ] Cancel subscription: Show "Processing cancellation..." (already done)
- [ ] All have timeouts (if API takes >10 seconds, show "This is taking longer than usual...")

---

## TIER 3: MEDIUM PRIORITY (Nice to Have)

### T3.1: Add Validation for Stripe Price IDs
**Status:** Price IDs are hardcoded, no validation

**Task:** Verify Price IDs exist + are valid format

**In upgrade-subscription.js:**
```javascript
// Add validation at top of handler
function validatePriceId(priceId) {
    if (!priceId.startsWith('price_1')) {
        throw new Error(`Invalid price ID format: ${priceId}`);
    }
    return true;
}

// Call in handler:
if (!validatePriceId(newPriceId)) {
    return res.status(500).json({ error: 'Invalid price configuration' });
}
```

---

### T3.2: Add Logging for Debugging
**Status:** Minimal logging in API functions

**Task:** Add structured logging without exposing secrets

**Checklist:**
- [ ] Log API call start: `console.log('[create-subscription] START', { tier, email })`
- [ ] Log successful Stripe calls: `console.log('[stripe] customer created', customer.id)`
- [ ] Log Firestore writes: `console.log('[firestore] user updated', userId)`
- [ ] Never log: passwords, payment methods, private keys
- [ ] All logs go to Vercel function logs (visible in dashboard)

**Example:**
```javascript
console.log('[upgrade-subscription] Attempting tier change', {
    userId,
    fromTier: currentTier,
    toTier: newTier,
    timestamp: new Date().toISOString()
});

try {
    const subscription = await stripe.subscriptions.update(subscriptionId, {...});
    console.log('[stripe] subscription updated', {
        subscriptionId: subscription.id,
        status: subscription.status
    });
} catch (error) {
    console.error('[stripe] subscription update failed', {
        subscriptionId,
        error: error.message,
        code: error.code
    });
}
```

---

### T3.3: Add Response Headers for Security
**Status:** Missing some security headers

**Task:** Add to all API endpoints

**Add to each API function:**
```javascript
// Headers for security
res.setHeader('X-Content-Type-Options', 'nosniff');
res.setHeader('X-Frame-Options', 'DENY');
res.setHeader('X-XSS-Protection', '1; mode=block');
res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
```

---

### T3.4: Improve Firestore Write Efficiency
**Status:** Some writes could be batched

**Task:** In create-subscription.js, batch multiple Firestore writes

**Current (inefficient):**
```javascript
await setDoc(doc(db, 'users', uid), profileData);
await updateDoc(doc(db, 'users', uid), stripeData); // 2 writes
```

**Better (batched):**
```javascript
const batch = writeBatch(db);
batch.set(doc(db, 'users', uid), {
    ...profileData,
    ...stripeData
});
await batch.commit(); // 1 write
```

---

## TIER 4: OPTIONAL ENHANCEMENTS

### T4.1: Add Rate Limiting
**Files:** All API endpoints

**Why:** Prevent abuse (spam signups, brute force)

**Implementation:**
```javascript
// Simple in-memory rate limiter (doesn't persist across Vercel instances)
const requestCounts = {};

function isRateLimited(clientId, limit = 5, window = 60000) {
    const now = Date.now();
    const key = clientId;
    
    if (!requestCounts[key]) {
        requestCounts[key] = [];
    }
    
    // Remove old requests
    requestCounts[key] = requestCounts[key].filter(t => now - t < window);
    
    if (requestCounts[key].length >= limit) {
        return true;
    }
    
    requestCounts[key].push(now);
    return false;
}
```

---

### T4.2: Add Unit Tests
**Status:** No tests exist

**Task:** Create simple test file for critical functions

**Create:** `tests/api.test.js`

**Test cases:**
```javascript
// Mock Stripe & Firebase
describe('create-subscription', () => {
    test('should reject missing email', () => {
        expect(validate({}, 'email')).toBe(false);
    });
    
    test('should reject invalid tier', () => {
        expect(validateTier('invalid')).toBe(false);
    });
    
    test('should accept valid tier (free/mid/premium)', () => {
        expect(validateTier('free')).toBe(true);
    });
});
```

---

## EXECUTION GUIDE FOR CLAUDE CODE

### 1. **Start with Audit**
```bash
bash sparkdate-audit.sh
```
This will output a comprehensive report of what needs fixing.

### 2. **Priority Order**
1. Run audit (5 min)
2. Fix T1.1 - T1.3 (30 min) — MUST DO
3. Implement T2.1 - T2.3 (60 min) — SHOULD DO
4. Add T2.4 & T3.1 (30 min) — NICE TO HAVE

### 3. **For Each Task**
- [ ] Read the task description
- [ ] Check current code (grep/search)
- [ ] Make changes
- [ ] Test locally if possible
- [ ] Commit to git with clear message

### 4. **Testing (After Each Major Change)**
```bash
# Check syntax
node -c api/upgrade-subscription.js

# Search for regressions
grep -r "old-field-name" public/ api/
```

### 5. **Commit Template**
```bash
git add .
git commit -m "Fix: [T1.1] Ensure gender field consistency across signup/account/event forms"
git push origin main
```

---

## SUCCESS CRITERIA

After completing these tasks:

✅ All critical issues (T1.x) resolved  
✅ User-facing forms have real-time validation  
✅ Error messages are clear, not technical  
✅ API endpoints have proper error handling  
✅ Security headers added  
✅ Ready for launch with confidence  

---

## NOTES FOR YOU (After You Return)

- Audit results will be in the commit log
- Any failed tests will have error messages in git history
- Check Vercel deployment log for any function errors
- Test signup flow with DevTools Network tab before going live
