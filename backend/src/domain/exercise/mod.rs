//! Exercises: what a person trains (bench press, plank, ...), what each set
//! of it records, and how exercises build on each other (progression tree).
//! Presets belong to nobody and are visible to everyone; other exercises
//! belong to one user (data-model §4.3).

use std::collections::HashMap;

use chrono::{DateTime, Utc};

use crate::domain::user::UserId;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ExerciseId([u8; 16]);

impl ExerciseId {
    pub fn from_bytes(bytes: [u8; 16]) -> Self {
        Self(bytes)
    }

    pub fn as_bytes(&self) -> &[u8; 16] {
        &self.0
    }
}

/// What a set of an exercise records.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum MeasurementKind {
    Reps,
    Weight,
    Time,
}

/// One measurement an exercise records, and whether every set must have it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Measurement {
    pub kind: MeasurementKind,
    pub required: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Owner {
    /// Provided by triary to everyone; cannot be changed.
    Preset,
    User(UserId),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Exercise {
    id: ExerciseId,
    owner: Owner,
    name: String,
    measurements: Vec<Measurement>,
    parent: Option<ExerciseId>,
    created_at: DateTime<Utc>,
}

impl Exercise {
    /// Rebuilds an exercise read from storage. Measurements come back in
    /// kind order.
    pub fn restore(
        id: ExerciseId,
        owner: Owner,
        name: String,
        mut measurements: Vec<Measurement>,
        parent: Option<ExerciseId>,
        created_at: DateTime<Utc>,
    ) -> Self {
        measurements.sort_by_key(|m| m.kind);
        Self {
            id,
            owner,
            name,
            measurements,
            parent,
            created_at,
        }
    }

    pub fn id(&self) -> ExerciseId {
        self.id
    }

    pub fn owner(&self) -> Owner {
        self.owner
    }

    pub fn name(&self) -> &str {
        &self.name
    }

    pub fn measurements(&self) -> &[Measurement] {
        &self.measurements
    }

    pub fn parent(&self) -> Option<ExerciseId> {
        self.parent
    }

    pub fn created_at(&self) -> DateTime<Utc> {
        self.created_at
    }

    /// Whether `user` may see this exercise: presets and their own.
    pub fn is_visible_to(&self, user: UserId) -> bool {
        match self.owner {
            Owner::Preset => true,
            Owner::User(owner) => owner == user,
        }
    }
}

/// Depth of every exercise in its progression tree (0 = root), from the
/// parent links among `exercises`. A parent outside the set counts as a
/// root above it; a cycle (which the write rules forbid) stops at the
/// first repeat instead of looping.
pub fn tree_depths(exercises: &[Exercise]) -> HashMap<ExerciseId, usize> {
    let parents: HashMap<ExerciseId, Option<ExerciseId>> =
        exercises.iter().map(|e| (e.id(), e.parent())).collect();
    exercises
        .iter()
        .map(|exercise| {
            let depth =
                std::iter::successors(exercise.parent(), |id| parents.get(id).copied().flatten())
                    .take(parents.len())
                    .count();
            (exercise.id(), depth)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    fn exercise(id: u8, parent: Option<u8>) -> Exercise {
        Exercise::restore(
            ExerciseId::from_bytes([id; 16]),
            Owner::Preset,
            format!("e{id}"),
            vec![],
            parent.map(|p| ExerciseId::from_bytes([p; 16])),
            DateTime::<Utc>::from_timestamp(0, 0).unwrap(),
        )
    }

    fn depth_of(depths: &HashMap<ExerciseId, usize>, id: u8) -> usize {
        depths[&ExerciseId::from_bytes([id; 16])]
    }

    #[test]
    fn depths_follow_parent_links() {
        let depths = tree_depths(&[
            exercise(1, None),
            exercise(2, Some(1)),
            exercise(3, Some(2)),
            exercise(4, None),
        ]);
        assert_eq!([1, 2, 3, 4].map(|id| depth_of(&depths, id)), [0, 1, 2, 0]);
    }

    #[test]
    fn a_parent_outside_the_set_still_counts_one_level() {
        let depths = tree_depths(&[exercise(2, Some(9))]);
        assert_eq!(depth_of(&depths, 2), 1);
    }

    #[test]
    fn a_cycle_does_not_loop_forever() {
        let depths = tree_depths(&[exercise(1, Some(2)), exercise(2, Some(1))]);
        assert!(depth_of(&depths, 1) <= 2);
    }

    #[test]
    fn measurements_are_kept_in_kind_order() {
        let e = Exercise::restore(
            ExerciseId::from_bytes([1; 16]),
            Owner::Preset,
            "x".into(),
            vec![
                Measurement {
                    kind: MeasurementKind::Weight,
                    required: false,
                },
                Measurement {
                    kind: MeasurementKind::Reps,
                    required: true,
                },
            ],
            None,
            DateTime::<Utc>::from_timestamp(0, 0).unwrap(),
        );
        assert_eq!(
            e.measurements().iter().map(|m| m.kind).collect::<Vec<_>>(),
            [MeasurementKind::Reps, MeasurementKind::Weight]
        );
    }

    #[test]
    fn visibility_is_presets_and_own_exercises() {
        let alice = UserId::from_bytes([1; 16]);
        let bob = UserId::from_bytes([2; 16]);
        let own = Exercise::restore(
            ExerciseId::from_bytes([5; 16]),
            Owner::User(alice),
            "x".into(),
            vec![],
            None,
            DateTime::<Utc>::from_timestamp(0, 0).unwrap(),
        );
        assert!(own.is_visible_to(alice));
        assert!(!own.is_visible_to(bob));
        assert!(exercise(1, None).is_visible_to(bob));
    }
}
