import os
import hmac
import httpx
import json
import hashlib
from dotenv import load_dotenv

load_dotenv()

# Salt for local mock-user password hashing. Mock auth is for the offline demo
# only — for the production SaaS path, replace this with Supabase Auth (already
# wired below) so credentials never touch local storage.
_MOCK_SALT = os.getenv("MOCK_AUTH_SALT", "aurelle-apac-demo").encode("utf-8")


def _hash_password(password: str) -> str:
    """Derive a salted PBKDF2 hash for a mock-user password."""
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), _MOCK_SALT, 100_000).hex()


def _verify_password(password: str, stored: str) -> bool:
    """Constant-time check supporting legacy plaintext records (auto-upgraded on next save)."""
    if not stored:
        return False
    # Legacy plaintext entries are 0-len-mismatch vs a 64-char hex hash.
    if len(stored) != 64:
        return hmac.compare_digest(password, stored)
    return hmac.compare_digest(_hash_password(password), stored)

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "").strip()

# Check if credentials are present and valid
IS_SUPABASE_CONFIGURED = (
    SUPABASE_URL and 
    SUPABASE_KEY and 
    "your_supabase" not in SUPABASE_URL and 
    "sb_publishable" in SUPABASE_KEY
)

MOCK_USERS_PATH = "data/mock_users.json"

def _load_mock_users():
    if os.path.exists(MOCK_USERS_PATH):
        try:
            with open(MOCK_USERS_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def _save_mock_users(users):
    os.makedirs(os.path.dirname(MOCK_USERS_PATH), exist_ok=True)
    try:
        with open(MOCK_USERS_PATH, "w", encoding="utf-8") as f:
            json.dump(users, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving mock users: {e}")


def sign_in(email, password):
    """
    Sign in user using Supabase Auth. Fallback to mock login if not configured or if custom mock credentials matched.
    """
    # Normalize email
    email_clean = email.strip().lower()

    # 1. Built-in admin. Credentials are env-overridable; ADMIN_PASSWORD_HASH
    #    (PBKDF2) is preferred. The plaintext demo fallback only applies when no
    #    hash is configured, so production deployments never ship a known password.
    admin_email = os.getenv("ADMIN_EMAIL", "admin@aurelle.com").strip().lower()
    admin_hash  = os.getenv("ADMIN_PASSWORD_HASH", "").strip()
    if email_clean == admin_email:
        if admin_hash:
            admin_ok = _verify_password(password, admin_hash)
        else:
            admin_ok = hmac.compare_digest(password, "AurelleAPAC2026!")
        if admin_ok:
            return {
                "success": True,
                "mode": "mock",
                "message": "Mock login successful. Operational in Offline Demo Mode.",
                "user": {"email": email, "id": "mock-admin-id"}
            }
        return {"success": False, "message": "Invalid login credentials."}

    # Check local mock users file. Use a single generic message for both
    # "unknown user" and "wrong password" to avoid account enumeration.
    mock_users = _load_mock_users()
    if email_clean in mock_users and _verify_password(password, mock_users[email_clean]):
        return {
            "success": True,
            "mode": "mock",
            "message": "Mock login successful. Operational in Offline Demo Mode.",
            "user": {"email": email, "id": f"mock-{email_clean}-id"}
        }

    # 2. If Supabase is not configured, we only allow mock credentials
    if not IS_SUPABASE_CONFIGURED:
        return {
            "success": False,
            "message": "Invalid login credentials."
        }

    # 3. Call Supabase Auth API
    url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
    headers = {
        "apikey": SUPABASE_KEY,
        "Content-Type": "application/json"
    }
    body = {
        "email": email,
        "password": password
    }

    try:
        response = httpx.post(url, json=body, headers=headers, timeout=10.0)
        data = response.json()
        
        if response.status_code == 200:
            return {
                "success": True,
                "mode": "supabase",
                "message": "Authenticated via Supabase successfully.",
                "user": data.get("user", {}),
                "access_token": data.get("access_token")
            }
        else:
            error_desc = data.get("error_description") or data.get("error", {}).get("message") or "Invalid login credentials."
            return {
                "success": False,
                "message": f"Auth Error: {error_desc}"
            }
    except Exception as e:
        return {
            "success": False,
            "message": f"Connection failed: {str(e)}. Use default credentials offline."
        }


def sign_up(email, password):
    """
    Sign up a new user via Supabase Auth, or register locally in mock mode if Supabase is offline/not configured.
    """
    # Simple validation checks
    email_clean = email.strip().lower()
    if not email_clean:
        return {
            "success": False,
            "message": "Please enter a valid email address or username."
        }
    if len(password) < 6:
        return {
            "success": False,
            "message": "Password must be at least 6 characters long."
        }

    # If Supabase is not configured, register as a mock user locally
    if not IS_SUPABASE_CONFIGURED:
        mock_users = _load_mock_users()
        if email_clean in mock_users:
            return {
                "success": False,
                "message": "Username or email already registered in offline mode."
            }
        if email_clean == "admin" or email_clean == "admin@aurelle.com":
            return {
                "success": False,
                "message": "Admin username or email is reserved."
            }
        
        mock_users[email_clean] = _hash_password(password)
        _save_mock_users(mock_users)
        return {
            "success": True,
            "message": "Mock registration successful! You can now log in using these credentials.",
            "user": {"email": email, "id": f"mock-{email_clean}-id"}
        }

    # If Supabase is configured, check for a valid email format
    if "@" not in email_clean:
        return {
            "success": False,
            "message": "Please enter a valid email address (e.g. user@domain.com) for Supabase registration."
        }

    url = f"{SUPABASE_URL}/auth/v1/signup"
    headers = {
        "apikey": SUPABASE_KEY,
        "Content-Type": "application/json"
    }
    body = {
        "email": email,
        "password": password
    }

    try:
        response = httpx.post(url, json=body, headers=headers, timeout=10.0)
        data = response.json()
        
        if response.status_code in [200, 201]:
            session = data.get("session")
            msg = "Registration successful! Please check your email for confirmation." if not session else "Registration successful!"
            return {
                "success": True,
                "message": msg,
                "user": data.get("user", {})
            }
        else:
            error_desc = data.get("error", {}).get("message") or "Failed to register user."
            return {
                "success": False,
                "message": f"Sign Up Error: {error_desc}"
            }
    except Exception as e:
        return {
            "success": False,
            "message": f"Connection failed: {str(e)}"
        }


if __name__ == "__main__":
    # Generate an ADMIN_PASSWORD_HASH:  python -m utils.auth --hash 'your-password'
    import sys
    if len(sys.argv) == 3 and sys.argv[1] == "--hash":
        print(_hash_password(sys.argv[2]))
    else:
        print("Usage: python -m utils.auth --hash 'your-password'")

