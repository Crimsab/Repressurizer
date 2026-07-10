use super::SamAchievementState;
use std::collections::{HashMap, HashSet};

pub(super) fn achievement_state_map(
    states: &[SamAchievementState],
) -> HashMap<String, SamAchievementState> {
    states
        .iter()
        .filter(|state| state.valid)
        .map(|state| (state.api_name.clone(), state.clone()))
        .collect()
}

pub(super) fn count_target_achievement_changes(
    before: &[SamAchievementState],
    after: &[SamAchievementState],
    target_set: &HashSet<String>,
) -> usize {
    let before_map = achievement_state_map(before);
    after
        .iter()
        .filter(|state| state.valid && target_set.contains(&state.api_name))
        .filter(|state| {
            before_map
                .get(&state.api_name)
                .map(|before_state| before_state.achieved != state.achieved)
                .unwrap_or(false)
        })
        .count()
}

pub(super) fn changed_non_target_states(
    before: &[SamAchievementState],
    after: &[SamAchievementState],
    target_set: &HashSet<String>,
) -> Vec<SamAchievementState> {
    let after_map = achievement_state_map(after);
    before
        .iter()
        .filter(|state| state.valid && !target_set.contains(&state.api_name))
        .filter(|state| {
            after_map
                .get(&state.api_name)
                .map(|after_state| after_state.achieved != state.achieved)
                .unwrap_or(false)
        })
        .cloned()
        .collect()
}

pub(super) fn unapplied_target_states(
    after: &[SamAchievementState],
    desired_states: &HashMap<String, bool>,
) -> Vec<String> {
    let after_map = achievement_state_map(after);
    desired_states
        .iter()
        .filter_map(|(id, desired)| {
            let Some(state) = after_map.get(id) else {
                return Some(id.clone());
            };
            (state.achieved != *desired).then(|| id.clone())
        })
        .collect()
}

pub(super) fn unapplied_target_state_details(
    after: &[SamAchievementState],
    desired_states: &HashMap<String, bool>,
) -> Vec<String> {
    let after_map = achievement_state_map(after);
    desired_states
        .iter()
        .filter_map(|(id, desired)| match after_map.get(id) {
            Some(state) if state.achieved != *desired => Some(format!(
                "{}:actual={},desired={}",
                id, state.achieved, desired
            )),
            None => Some(format!("{id}:actual=missing,desired={desired}")),
            _ => None,
        })
        .collect()
}

pub(super) fn normalized_achievement_ids(ids: &[String]) -> Vec<String> {
    dedupe_strings(
        ids.iter()
            .map(|id| id.trim())
            .filter(|id| !id.is_empty())
            .map(ToString::to_string)
            .collect(),
    )
}

pub(super) fn dedupe_strings(values: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut deduped = Vec::new();
    for value in values {
        if seen.insert(value.clone()) {
            deduped.push(value);
        }
    }
    deduped
}
