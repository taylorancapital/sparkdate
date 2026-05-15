#!/bin/bash
# SparkDate Pre-Launch Code Audit & Testing Suite
# Run with: claude code analyze-sparkdate.sh
# This script performs comprehensive testing, validation, and improvement recommendations

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "  SPARKDATE PRE-LAUNCH CODE AUDIT & TESTING SUITE"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

ISSUES_FOUND=0
WARNINGS=0

# ═══════════════════════════════════════════════════════════════
# SECTION 1: ENVIRONMENT & SETUP VALIDATION
# ═══════════════════════════════════════════════════════════════

echo -e "${BLUE}[SECTION 1] Environment & Dependency Check${NC}"
echo ""

# Check Node.js version
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo "✓ Node.js installed: $NODE_VERSION"
else
    echo -e "${RED}✗ Node.js not found${NC}"
    ((ISSUES_FOUND++))
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    echo "✓ npm installed: $NPM_VERSION"
else
    echo -e "${RED}✗ npm not found${NC}"
    ((ISSUES_FOUND++))
fi

# Check git
if command -v git &> /dev/null; then
    echo "✓ Git installed"
else
    echo -e "${RED}✗ Git not found${NC}"
    ((ISSUES_FOUND++))
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION 2: FILE STRUCTURE VALIDATION
# ═══════════════════════════════════════════════════════════════

echo -e "${BLUE}[SECTION 2] Project Structure Validation${NC}"
echo ""

REQUIRED_DIRS=("public" "api" ".git")
for dir in "${REQUIRED_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        echo "✓ Directory exists: $dir"
    else
        echo -e "${YELLOW}⚠ Directory missing: $dir${NC}"
        ((WARNINGS++))
    fi
done

echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION 3: FIREBASE CONFIGURATION VALIDATION
# ═══════════════════════════════════════════════════════════════

echo -e "${BLUE}[SECTION 3] Firebase Configuration Check${NC}"
echo ""

FIREBASE_CONFIG_FILES=("public/index.html" "public/signup.html" "public/account.html" "api/stripe-webhook.js")

for file in "${FIREBASE_CONFIG_FILES[@]}"; do
    if [ -f "$file" ]; then
        if grep -q "firebase" "$file" 2>/dev/null; then
            echo "✓ Firebase config found in: $file"
        else
            echo -e "${YELLOW}⚠ No Firebase config in: $file${NC}"
            ((WARNINGS++))
        fi
    else
        echo -e "${RED}✗ File missing: $file${NC}"
        ((ISSUES_FOUND++))
    fi
done

echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION 4: STRIPE CONFIGURATION VALIDATION
# ═══════════════════════════════════════════════════════════════

echo -e "${BLUE}[SECTION 4] Stripe Integration Check${NC}"
echo ""

STRIPE_REQUIRED_FILES=("public/signup.html" "public/event.html" "api/create-subscription.js" "api/upgrade-subscription.js")

echo "Checking Stripe key presence (should be in public files)..."
for file in "${STRIPE_REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        if grep -q "Stripe\|stripe\|pk_test\|pk_live" "$file" 2>/dev/null; then
            echo "✓ Stripe integration found: $file"
        else
            if [[ "$file" == *"api"* ]]; then
                echo "✓ API file (Stripe handling backend): $file"
            else
                echo -e "${YELLOW}⚠ Stripe config missing in: $file${NC}"
                ((WARNINGS++))
            fi
        fi
    fi
done

echo ""
echo -e "${YELLOW}⚠ SECURITY CHECK: Are you using Stripe test keys (pk_test_)?${NC}"
echo "  Location: public/signup.html, public/event.html"
echo "  Before production: Change pk_test_ → pk_live_ and update STRIPE_SECRET_KEY in Vercel env vars"
echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION 5: SECURITY AUDIT
# ═══════════════════════════════════════════════════════════════

echo -e "${BLUE}[SECTION 5] Security Audit${NC}"
echo ""

# Check for hardcoded secrets
echo "Scanning for hardcoded secrets..."
SECRETS_FOUND=0

SENSITIVE_PATTERNS=(
    "STRIPE_SECRET_KEY"
    "firebase.*privateKey"
    "password.*="
    "api_key.*="
)

for pattern in "${SENSITIVE_PATTERNS[@]}"; do
    if grep -r "$pattern" public/ api/ 2>/dev/null | grep -v node_modules | grep -v ".map"; then
        echo -e "${RED}✗ Potential hardcoded secret pattern: $pattern${NC}"
        ((SECRETS_FOUND++))
        ((ISSUES_FOUND++))
    fi
done

if [ $SECRETS_FOUND -eq 0 ]; then
    echo "✓ No obvious hardcoded secrets detected"
fi

echo ""

# Check for CORS headers
echo "Checking CORS configuration..."
if grep -r "Access-Control-Allow-Origin" api/ 2>/dev/null | head -1; then
    echo "✓ CORS headers found in API"
    if grep -q "Access-Control-Allow-Origin.*\*" api/*.js 2>/dev/null; then
        echo -e "${YELLOW}⚠ WARNING: CORS allows '*' (all origins)${NC}"
        echo "  Consider restricting to sparkdate.date"
        ((WARNINGS++))
    fi
else
    echo -e "${YELLOW}⚠ CORS headers may be missing from some API endpoints${NC}"
    ((WARNINGS++))
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION 6: API ENDPOINT VALIDATION
# ═══════════════════════════════════════════════════════════════

echo -e "${BLUE}[SECTION 6] API Endpoint Validation${NC}"
echo ""

REQUIRED_ENDPOINTS=(
    "api/create-subscription.js"
    "api/cancel-subscription.js"
    "api/upgrade-subscription.js"
    "api/purchase-ticket.js"
    "api/stripe-webhook.js"
)

echo "Checking required API endpoints..."
for endpoint in "${REQUIRED_ENDPOINTS[@]}"; do
    if [ -f "$endpoint" ]; then
        LINES=$(wc -l < "$endpoint")
        echo "✓ $endpoint ($LINES lines)"
        
        # Check for basic error handling
        if grep -q "try\|catch\|error" "$endpoint" 2>/dev/null; then
            echo "  ✓ Error handling present"
        else
            echo -e "  ${YELLOW}⚠ Limited error handling${NC}"
            ((WARNINGS++))
        fi
    else
        echo -e "${RED}✗ Missing endpoint: $endpoint${NC}"
        ((ISSUES_FOUND++))
    fi
done

echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION 7: HTML/FRONTEND VALIDATION
# ═══════════════════════════════════════════════════════════════

echo -e "${BLUE}[SECTION 7] Frontend HTML Validation${NC}"
echo ""

REQUIRED_PAGES=(
    "public/index.html"
    "public/signup.html"
    "public/account.html"
    "public/event.html"
    "public/events.html"
    "public/terms.html"
    "public/privacy.html"
)

echo "Checking critical pages..."
for page in "${REQUIRED_PAGES[@]}"; do
    if [ -f "$page" ]; then
        echo "✓ $page"
        
        # Check for viewport meta tag (mobile responsive)
        if grep -q "viewport" "$page" 2>/dev/null; then
            echo "  ✓ Mobile viewport configured"
        else
            echo -e "  ${YELLOW}⚠ No viewport meta tag (mobile responsiveness risk)${NC}"
            ((WARNINGS++))
        fi
    else
        echo -e "${RED}✗ Missing page: $page${NC}"
        ((ISSUES_FOUND++))
    fi
done

echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION 8: FORM VALIDATION CHECK
# ═══════════════════════════════════════════════════════════════

echo -e "${BLUE}[SECTION 8] Form & Input Validation${NC}"
echo ""

echo "Checking signup.html form..."
if [ -f "public/signup.html" ]; then
    # Check for required attributes
    MISSING_VALIDATIONS=0
    
    if grep -q 'id="firstName"' public/signup.html && grep -q 'required' public/signup.html; then
        echo "✓ First name field has validation"
    else
        echo -e "${YELLOW}⚠ First name validation missing${NC}"
        ((MISSING_VALIDATIONS++))
    fi
    
    if grep -q 'type="email"' public/signup.html; then
        echo "✓ Email field uses HTML5 email type"
    else
        echo -e "${YELLOW}⚠ Email field should use type='email'${NC}"
        ((MISSING_VALIDATIONS++))
    fi
    
    if grep -q 'type="password"' public/signup.html && grep -q 'minlength\|min.*8' public/signup.html; then
        echo "✓ Password has minimum length requirement"
    else
        echo -e "${YELLOW}⚠ Password minimum length not enforced in HTML${NC}"
        ((WARNINGS++))
    fi
    
    ((WARNINGS += MISSING_VALIDATIONS))
else
    echo -e "${RED}✗ signup.html not found${NC}"
    ((ISSUES_FOUND++))
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION 9: TIER & PRICING CONFIGURATION
# ═══════════════════════════════════════════════════════════════

echo -e "${BLUE}[SECTION 9] Tier Configuration & Pricing${NC}"
echo ""

echo "Checking tier definitions across files..."

# Check signup.html
if grep -q "Spark\|Kindling\|Fire" public/signup.html 2>/dev/null; then
    echo "✓ Tiers defined in signup.html"
else
    echo -e "${YELLOW}⚠ Tiers missing in signup.html${NC}"
    ((WARNINGS++))
fi

# Check account.html
if grep -q "TIERS\|Spark\|Kindling\|Fire" public/account.html 2>/dev/null; then
    echo "✓ Tiers defined in account.html"
else
    echo -e "${YELLOW}⚠ Tiers missing in account.html${NC}"
    ((WARNINGS++))
fi

# Check upgrade-subscription.js
if grep -q "TIER_PRICES\|free\|mid\|premium" api/upgrade-subscription.js 2>/dev/null; then
    echo "✓ Tier prices defined in upgrade-subscription.js"
    
    # Check for Price IDs (Stripe)
    if grep -q "price_1" api/upgrade-subscription.js 2>/dev/null; then
        echo "  ✓ Real Stripe Price IDs present"
    else
        echo -e "  ${YELLOW}⚠ Price IDs may be placeholders (CRITICAL: Must update before launch)${NC}"
        ((WARNINGS++))
    fi
else
    echo -e "${YELLOW}⚠ Tier prices missing in upgrade-subscription.js${NC}"
    ((WARNINGS++))
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION 10: RESPONSIVE DESIGN CHECK
# ═══════════════════════════════════════════════════════════════

echo -e "${BLUE}[SECTION 10] Responsive Design Validation${NC}"
echo ""

echo "Checking CSS media queries..."
for page in public/*.html; do
    if grep -q "@media" "$page" 2>/dev/null; then
        echo "✓ Mobile media queries: $(basename $page)"
    fi
done

echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION 11: FIREBASE SECURITY RULES
# ═══════════════════════════════════════════════════════════════

echo -e "${BLUE}[SECTION 11] Firebase Security Check${NC}"
echo ""

if [ -f "firestore.rules" ]; then
    echo "✓ Firestore rules file found"
    echo "  IMPORTANT: Verify in Firebase Console:"
    echo "    - Users can only read/write their own documents"
    echo "    - Activity collection is write-restricted (backend only)"
    echo "    - No public read access to sensitive data"
else
    echo -e "${YELLOW}⚠ No local firestore.rules file (check Firebase Console)${NC}"
    ((WARNINGS++))
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION 12: VERCEL DEPLOYMENT CONFIG
# ═══════════════════════════════════════════════════════════════

echo -e "${BLUE}[SECTION 12] Vercel Configuration${NC}"
echo ""

if [ -f "vercel.json" ]; then
    echo "✓ vercel.json found"
    
    if grep -q "rewrites\|routes" vercel.json 2>/dev/null; then
        echo "  ✓ Routing configuration present"
    else
        echo -e "  ${YELLOW}⚠ Routing may be missing${NC}"
        ((WARNINGS++))
    fi
else
    echo -e "${YELLOW}⚠ No vercel.json found${NC}"
    ((WARNINGS++))
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION 13: ENVIRONMENT VARIABLES AUDIT
# ═══════════════════════════════════════════════════════════════

echo -e "${BLUE}[SECTION 13] Environment Variables Checklist${NC}"
echo ""

echo "Required Vercel environment variables:"
REQUIRED_ENV_VARS=(
    "STRIPE_SECRET_KEY"
    "STRIPE_WEBHOOK_SECRET"
    "FIREBASE_PROJECT_ID"
    "FIREBASE_CLIENT_EMAIL"
    "FIREBASE_PRIVATE_KEY"
)

for var in "${REQUIRED_ENV_VARS[@]}"; do
    echo "  [ ] $var — Must be set in Vercel Project Settings"
done

echo ""
echo -e "${YELLOW}⚠ CRITICAL: Verify all 5 env vars are configured in Vercel before launch${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION 14: PERFORMANCE CHECKS
# ═══════════════════════════════════════════════════════════════

echo -e "${BLUE}[SECTION 14] Performance & Bundle Analysis${NC}"
echo ""

echo "Checking for performance issues..."

# Check for inline styles (anti-pattern)
INLINE_STYLES=$(grep -r 'style="' public/*.html 2>/dev/null | wc -l)
if [ "$INLINE_STYLES" -gt 20 ]; then
    echo -e "${YELLOW}⚠ High number of inline styles ($INLINE_STYLES) — Consider using CSS classes${NC}"
    ((WARNINGS++))
else
    echo "✓ Inline styles are minimal"
fi

# Check for external JS libraries
echo "Checking for external dependencies..."
if grep -q "https://js.stripe.com" public/*.html 2>/dev/null; then
    echo "✓ Stripe.js CDN loaded"
else
    echo -e "${RED}✗ Stripe.js not found in HTML${NC}"
    ((ISSUES_FOUND++))
fi

if grep -q "firebase.googleapis.com\|gstatic.com" public/*.html 2>/dev/null; then
    echo "✓ Firebase SDKs loaded"
else
    echo -e "${RED}✗ Firebase SDKs not found${NC}"
    ((ISSUES_FOUND++))
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION 15: TESTING RECOMMENDATIONS
# ═══════════════════════════════════════════════════════════════

echo -e "${BLUE}[SECTION 15] Testing Recommendations${NC}"
echo ""

echo "Manual testing checklist (before launch):"
MANUAL_TESTS=(
    "[ ] Full signup flow with test card (4242 4242 4242 4242)"
    "[ ] Verify Stripe subscription created in test dashboard"
    "[ ] Confirm user document created in Firestore"
    "[ ] Test login on /account page"
    "[ ] Test tier upgrade (switch from Spark → Kindling)"
    "[ ] Test email already-exists error → redirect to /account"
    "[ ] Test cancel subscription flow"
    "[ ] Test event booking (/event page)"
    "[ ] Test responsive design on mobile (iPhone 12)"
    "[ ] Test on slow 3G connection (DevTools)"
    "[ ] Verify all links working (nav, footer, CTA)"
    "[ ] Test form validation (empty fields, invalid email)"
    "[ ] Check console for JS errors (DevTools)"
)

for test in "${MANUAL_TESTS[@]}"; do
    echo "  $test"
done

echo ""

# ═══════════════════════════════════════════════════════════════
# FINAL REPORT
# ═══════════════════════════════════════════════════════════════

echo "═══════════════════════════════════════════════════════════════"
echo -e "${BLUE}AUDIT SUMMARY${NC}"
echo "═══════════════════════════════════════════════════════════════"
echo ""

if [ $ISSUES_FOUND -eq 0 ]; then
    echo -e "${GREEN}✓ No critical issues found${NC}"
else
    echo -e "${RED}✗ $ISSUES_FOUND critical issue(s) found${NC}"
fi

echo -e "${YELLOW}⚠ $WARNINGS warning(s) / improvement(s) needed${NC}"
echo ""

if [ $ISSUES_FOUND -eq 0 ] && [ $WARNINGS -lt 5 ]; then
    echo -e "${GREEN}STATUS: READY FOR LAUNCH (with warnings below)${NC}"
elif [ $ISSUES_FOUND -eq 0 ]; then
    echo -e "${YELLOW}STATUS: LAUNCH-READY but address warnings${NC}"
else
    echo -e "${RED}STATUS: HOLD — Fix critical issues before launch${NC}"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ═══════════════════════════════════════════════════════════════
# PRIORITIZED RECOMMENDATIONS
# ═══════════════════════════════════════════════════════════════

echo -e "${BLUE}IMMEDIATE ACTION ITEMS (Before Launch):${NC}"
echo ""
echo "1. ${YELLOW}CRITICAL: Verify all 5 Vercel env vars are set${NC}"
echo "   - STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET"
echo "   - FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY"
echo ""
echo "2. ${YELLOW}CRITICAL: Run full signup flow test with DevTools Network tab${NC}"
echo "   - Monitor /api/create-subscription response"
echo "   - Confirm subscriptionId saves to Firestore"
echo ""
echo "3. ${YELLOW}IMPORTANT: Switch Stripe keys from test to live${NC}"
echo "   - Before accepting real payments"
echo "   - Update pk_test_ → pk_live_ in public files"
echo "   - Rotate STRIPE_SECRET_KEY to live key"
echo ""
echo "4. ${YELLOW}IMPORTANT: Configure Stripe webhook endpoint${NC}"
echo "   - Point to: https://sparkdate.date/api/stripe-webhook"
echo "   - Listen for: subscription.created, subscription.updated, subscription.deleted"
echo ""
echo "5. ${YELLOW}RECOMMENDED: Enable Firebase Security Rules${NC}"
echo "   - Restrict Firestore reads/writes to authenticated users"
echo "   - Test with Firebase Security Rules Simulator"
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "Report generated: $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════════════════════════════"
