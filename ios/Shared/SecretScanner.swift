import Foundation

enum SecretScanner {
    private static let patterns: [(name: String, regex: NSRegularExpression)] = [
        ("OpenAI API key", #"\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{24,}\b"#),
        ("Anthropic API key", #"\bsk-ant-(?:api03-)?[A-Za-z0-9_-]{32,}\b"#),
        ("AWS access key", #"\bAKIA[0-9A-Z]{16}\b"#),
        ("GitHub token", #"\bgh[pousr]_[A-Za-z0-9_]{36,255}\b"#),
        ("Private key", #"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"#),
        ("Password-like text", #"(?i)\bpassword\s*[:=]\s*[^\s,;]{8,}"#)
    ].compactMap { item in
        guard let regex = try? NSRegularExpression(pattern: item.1) else { return nil }
        return (item.0, regex)
    }

    static func matchingRule(in text: String) -> String? {
        let range = NSRange(text.startIndex..., in: text)
        return patterns.first { $0.regex.firstMatch(in: text, range: range) != nil }?.name
    }
}
