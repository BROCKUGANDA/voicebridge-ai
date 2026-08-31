// Personalization engine - adapts responses based on user behavior patterns

export interface UserBehaviorProfile {
  averageCommandLength: number
  preferredCommandStyle: 'concise' | 'natural' | 'detailed'
  commonCommands: Map<string, number>
  averageResponseTime: number
  errorRecoveryRate: number
  preferredNavigationStyle: 'sequential' | 'jump'
  sessionFrequency: number
}

export function createProfile(): UserBehaviorProfile {
  return {
    averageCommandLength: 0,
    preferredCommandStyle: 'natural',
    commonCommands: new Map(),
    averageResponseTime: 0,
    errorRecoveryRate: 0,
    preferredNavigationStyle: 'sequential',
    sessionFrequency: 0,
  }
}

export function updateProfile(
  profile: UserBehaviorProfile,
  command: string,
  responseTimeMs: number,
  success: boolean
): UserBehaviorProfile {
  const newProfile = { ...profile, commonCommands: new Map(profile.commonCommands) }

  // Update average command length
  const total = newProfile.averageCommandLength
  const newLength = command.length
  newProfile.averageCommandLength = total > 0 ? (total * 0.9 + newLength * 0.1) : newLength

  // Detect command style
  if (command.split(' ').length <= 3) {
    newProfile.preferredCommandStyle = 'concise'
  } else if (command.split(' ').length > 8) {
    newProfile.preferredCommandStyle = 'detailed'
  }

  // Track common commands
  const normalizedCmd = command.toLowerCase().trim()
  const count = (newProfile.commonCommands.get(normalizedCmd) || 0) + 1
  newProfile.commonCommands.set(normalizedCmd, count)

  // Update response time
  if (responseTimeMs > 0) {
    newProfile.averageResponseTime =
      newProfile.averageResponseTime > 0
        ? newProfile.averageResponseTime * 0.8 + responseTimeMs * 0.2
        : responseTimeMs
  }

  // Track error recovery
  if (!success) {
    newProfile.errorRecoveryRate = Math.min(1, newProfile.errorRecoveryRate + 0.1)
  }

  return newProfile
}

export function getPersonalizedResponse(
  profile: UserBehaviorProfile,
  baseResponse: string,
  isRetry: boolean
): string {
  let response = baseResponse

  // If user prefers concise, trim response
  if (profile.preferredCommandStyle === 'concise') {
    response = shortenResponse(response, 0.7)
  } else if (profile.preferredCommandStyle === 'detailed') {
    response = enhanceResponse(response)
  }

  // If this is a retry, be more helpful
  if (isRetry && profile.errorRecoveryRate > 0.3) {
    response = addRecoveryGuidance(response)
  }

  // Suggest shortcuts for frequent commands
  const topCommands = getTopCommands(profile.commonCommands, 3)
  if (topCommands.length > 0 && profile.sessionFrequency > 3) {
    // Could add: "You use this command often. Would you like to set up a shortcut?"
  }

  return response
}

function shortenResponse(text: string, factor: number): string {
  const sentences = text.split(/(?<=[.!?])\s+/)
  const keepCount = Math.max(1, Math.ceil(sentences.length * factor))
  return sentences.slice(0, keepCount).join(' ')
}

function enhanceResponse(text: string): string {
  if (text.endsWith('.')) {
    return text + ' Is there anything specific about this you would like me to explain further?'
  }
  return text
}

function addRecoveryGuidance(text: string): string {
  return text + ' If this does not work, try rephrasing your command or say "help" for available options.'
}

function getTopCommands(commands: Map<string, number>, count: number): string[] {
  return Array.from(commands.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([cmd]) => cmd)
}

// Adaptive verbosity adjustment
export function suggestVerbosityAdjustment(
  profile: UserBehaviorProfile,
  currentVerbosity: 'concise' | 'balanced' | 'detailed'
): 'concise' | 'balanced' | 'detailed' | null {
  if (profile.averageCommandLength < 20 && currentVerbosity !== 'concise') {
    return 'concise'
  }
  if (profile.averageCommandLength > 60 && currentVerbosity !== 'detailed') {
    return 'detailed'
  }
  return null
}