# AGP Roadmap

AGP is currently an experimental interoperability prototype. The roadmap prioritizes evidence that one semantic model can work across fundamentally different technologies.

## 0.1 — Working model

- [x] Core Access Graph object
- [x] Access Profile
- [x] Risk and confirmation model
- [x] JavaScript reference SDK
- [x] Website demo
- [x] Drone simulator demo
- [x] HTML/ARIA adapter
- [x] JSON Schemas

## 0.2 — Interoperability proof

- [ ] Windows UI Automation adapter
- [ ] Android accessibility adapter
- [x] W3C Web of Things adapter
- [x] SPECS semantic view and safety bridge
- [x] Simulated WoT smart-device/SPECS interaction demo
- [ ] Lens Studio (SPECS 27) project — source complete in `examples/specs/lens-project/` (real TypeScript against SIK/Spectacles UI Kit/ASR/TTS, world-locked controls, hand + exact-voice input, captions/speech/large-text/high-contrast/reduced-motion/one-step, confirmation and authorization kept as separate gates); not yet device-tested (see "0.4 — Real-world pilots") and has no slider/dial input control yet for parameterized actions
- [ ] Matter capability mapping experiment
- [ ] MCP tool projection for AGP actions
- [ ] Event subscription model
- [ ] Capability discovery document at `/.well-known/agp`
- [ ] Conformance test runner

## 0.3 — Safety, privacy, and trust

- [ ] Normative authorization model
- [ ] Data minimization rules for Access Profiles
- [ ] Local/ephemeral profile exchange
- [ ] Trust provenance and confidence vocabulary
- [ ] Restricted action classes for physical motion, security, financial, and destructive operations
- [ ] Threat model and security review

## 0.4 — Real-world pilots

- [ ] Public-service kiosk pilot
- [ ] Smart-home/device pilot
- [ ] Drone or robotics pilot
- [ ] Screen-reader/assistive-technology prototype client
- [ ] On-device Spectacles usability test of `examples/specs/lens-project/` (source complete, hardware-untested) plus a slider/dial control for parameterized actions
- [ ] Usability study with disabled participants and accessibility practitioners

## 1.0 candidate

A 1.0 proposal should not be declared until AGP demonstrates useful interoperability across at least three independent technology domains and has external implementer feedback.

Potential standardization paths to evaluate after the prototype is validated include W3C Community Group incubation and collaboration with existing accessibility, web-of-things, assistive-technology, and device-interoperability communities.
