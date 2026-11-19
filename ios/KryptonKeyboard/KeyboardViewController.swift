import UIKit

final class KeyboardViewController: UIInputViewController {
    private let warningLabel = UILabel()
    private var isUppercase = false
    private var isSymbols = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.12, green: 0.15, blue: 0.2, alpha: 1)
        buildKeyboard()
    }

    private func buildKeyboard() {
        let root = UIStackView()
        root.axis = .vertical
        root.spacing = 8
        root.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(root)
        NSLayoutConstraint.activate([
            root.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 4),
            root.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -4),
            root.topAnchor.constraint(equalTo: view.topAnchor, constant: 8),
            root.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -8)
        ])

        warningLabel.font = .systemFont(ofSize: 11, weight: .medium)
        warningLabel.textColor = .systemYellow
        warningLabel.textAlignment = .center
        warningLabel.numberOfLines = 2
        root.addArrangedSubview(warningLabel)

        let rows = isSymbols ? ["1234567890", "@#$&*-+()", "!\"'/:;?"] : ["qwertyuiop", "asdfghjkl", "zxcvbnm"]
        for (index, letters) in rows.enumerated() {
            let row = UIStackView()
            row.axis = .horizontal
            row.spacing = 4
            row.distribution = .fillEqually
            if !isSymbols && index == 2 {
                row.addArrangedSubview(makeButton("⇧", action: #selector(toggleCase), wide: true))
            }
            for letter in letters {
                let value = String(letter)
                row.addArrangedSubview(makeButton(display(value), action: #selector(insertCharacter(_:))))
            }
            if !isSymbols && index == 2 {
                row.addArrangedSubview(makeButton("⌫", action: #selector(deleteCharacter), wide: true))
            }
            if isSymbols && index == 2 {
                row.insertArrangedSubview(makeButton("ABC", action: #selector(toggleSymbols), wide: true), at: 0)
                row.addArrangedSubview(makeButton("⌫", action: #selector(deleteCharacter), wide: true))
            }
            root.addArrangedSubview(row)
        }

        let bottom = UIStackView()
        bottom.axis = .horizontal
        bottom.spacing = 4
        bottom.distribution = .fill
        bottom.addArrangedSubview(makeButton(isSymbols ? "ABC" : "123", action: #selector(toggleSymbols), wide: true))
        bottom.addArrangedSubview(makeButton("🌐", action: #selector(nextKeyboard), wide: true))
        bottom.addArrangedSubview(makeButton("space", action: #selector(insertSpace), wide: true))
        bottom.addArrangedSubview(makeButton("return", action: #selector(insertReturn), wide: true))
        root.addArrangedSubview(bottom)
    }

    private func display(_ value: String) -> String {
        isUppercase ? value.uppercased() : value
    }

    private func makeButton(_ title: String, action: Selector, wide: Bool = false) -> UIButton {
        let button = UIButton(type: .system)
        button.setTitle(title, for: .normal)
        button.titleLabel?.font = .systemFont(ofSize: wide ? 13 : 18, weight: .medium)
        button.setTitleColor(.white, for: .normal)
        button.backgroundColor = wide
            ? UIColor(red: 0.23, green: 0.28, blue: 0.36, alpha: 1)
            : UIColor(red: 0.2, green: 0.24, blue: 0.31, alpha: 1)
        button.layer.cornerRadius = 6
        button.addTarget(self, action: action, for: .touchUpInside)
        button.heightAnchor.constraint(equalToConstant: 42).isActive = true
        return button
    }

    @objc private func insertCharacter(_ sender: UIButton) {
        guard let text = sender.title(for: .normal) else { return }
        insertChecked(text)
        isUppercase = false
        refreshKeys()
    }

    @objc private func insertSpace() {
        insertChecked(" ")
    }

    @objc private func insertReturn() {
        insertChecked("\n")
    }

    private func insertChecked(_ text: String) {
        let before = textDocumentProxy.documentContextBeforeInput ?? ""
        let after = textDocumentProxy.documentContextAfterInput ?? ""
        let context = String((before + text + after).suffix(4096))
        if let match = SecretScanner.matchingRule(in: context) {
            warningLabel.text = "\(match) detected — not inserted"
            return
        }
        warningLabel.text = nil
        textDocumentProxy.insertText(text)
    }

    @objc private func deleteCharacter() {
        textDocumentProxy.deleteBackward()
        warningLabel.text = nil
    }

    @objc private func toggleCase() {
        isUppercase.toggle()
        refreshKeys()
    }

    @objc private func toggleSymbols() {
        isSymbols.toggle()
        refreshKeys()
    }

    @objc private func nextKeyboard() {
        advanceToNextInputMode()
    }

    private func refreshKeys() {
        view.subviews.compactMap({ $0 as? UIStackView }).forEach { $0.removeFromSuperview() }
        buildKeyboard()
    }

}
