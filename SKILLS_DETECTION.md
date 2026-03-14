# Skills Detection System

## Architecture

The system has **two modes** controlled by environment variable:

1. **Static Mode** (Current) - Returns comprehensive list of 29 skills
2. **Dynamic Mode** (Future) - Reads skills from remote server via SSH

## Current Behavior (v2.19.0)

```
GET /api/chat/skills?serverIp=172.31.6.240
→ Returns 29 static skills from getStaticSkills()
```

**Feature Flag**: `DYNAMIC_SKILLS=false` (default)

## How to Enable Dynamic Detection

### Step 1: Set Environment Variable

Add to `/home/ubuntu/system-monitor/.env`:

```bash
DYNAMIC_SKILLS=true
```

### Step 2: Implement SSH Logic

Edit `server/routes/chatRoutes.js` → `getSkillsFromSSH()` function:

```javascript
async function getSkillsFromSSH(serverIp) {
  const pool = getSSHPool();

  try {
    // 1. Read skill directories
    const skillDirs = await pool.exec(serverIp,
      'ls -1 ~/.claude/skills/ 2>/dev/null || echo ""',
      { timeout: 5000 }
    );

    // 2. Parse directories to skill names
    const skills = skillDirs.trim().split('\n')
      .filter(Boolean)
      .map(dirName => {
        // Convert "superpower-tdd" → "superpower:tdd"
        const cmdName = dirName.replace(/-/g, ':');

        return {
          id: cmdName,
          name: `/${cmdName}`,
          description: 'TODO: Parse from SKILL.md',
          category: 'skill'
        };
      });

    // 3. Fallback to static list if empty
    return skills.length > 0 ? skills : getStaticSkills();

  } catch (err) {
    console.error('[SSH Skills] Error:', err.message);
    return getStaticSkills(); // Safe fallback
  }
}
```

### Step 3: Restart Server

```bash
cd /home/ubuntu/system-monitor
pm2 restart monitor-api
```

## Code Structure

```
chatRoutes.js
├── GET /api/chat/skills
│   ├── Check DYNAMIC_SKILLS flag
│   ├── If true → getSkillsFromSSH(serverIp)
│   └── If false → getStaticSkills()
│
├── getSkillsFromSSH(serverIp)  [FUTURE]
│   ├── Read ~/.claude/skills/ via SSH
│   ├── Parse SKILL.md files
│   └── Return dynamic skill list
│
└── getStaticSkills()  [CURRENT]
    └── Return hardcoded 29 skills
```

## Benefits of This Architecture

1. **Zero Downtime**: Static list works reliably now
2. **Easy Migration**: Change 1 environment variable to enable dynamic mode
3. **Safe Fallback**: SSH failures automatically use static list
4. **Clear Separation**: Static vs dynamic logic in separate functions
5. **Future-Proof**: SSH implementation ready to be filled in

## Testing

```bash
# Test static mode (current)
curl -s "https://monitor.ko.unieai.com/api/chat/skills?serverIp=172.31.6.240" | jq '.skills | length'
# Expected: 29

# Test dynamic mode (future)
# 1. Set DYNAMIC_SKILLS=true in .env
# 2. Implement getSkillsFromSSH()
# 3. Restart server
# 4. Test again
```

## Known Issues (Why SSH is Not Enabled Yet)

1. **Timeout**: `claude skills list` takes >10s
2. **Command Not Found**: SSH can't find `claude` binary in PATH
3. **Parsing Complexity**: Converting directory names to command names needs careful mapping

**Solution**: Use directory-based detection (`ls ~/.claude/skills/`) instead of `claude skills list`

## Migration Path

```
v2.19.0 (Current)
  └─ Static 29 skills
  └─ Feature flag ready
  └─ SSH function framework ready

v2.20.0 (Future)
  └─ Implement getSkillsFromSSH()
  └─ Set DYNAMIC_SKILLS=true
  └─ Test on single server
  └─ Rollout to all servers
```

## Maintenance

- **Add new skill**: Update `getStaticSkills()` array
- **Remove skill**: Remove from `getStaticSkills()` array
- **Change description**: Edit `getStaticSkills()` array

When dynamic mode is enabled, static list becomes fallback only.
