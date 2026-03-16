from __future__ import annotations

from pydantic import BaseModel


class FlowNode(BaseModel):
    id: str
    title: str
    summary: str
    learningFocus: str
    output: str


class GlossaryItem(BaseModel):
    term: str
    description: str


class DeliveryMilestone(BaseModel):
    name: str
    goal: str
    deliverables: list[str]


class HeroSection(BaseModel):
    title: str
    subtitle: str


class RagOverview(BaseModel):
    hero: HeroSection
    flow: list[FlowNode]
    glossary: list[GlossaryItem]
    sprintOne: list[DeliveryMilestone]

